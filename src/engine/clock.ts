import type { GameState, PendingDecision, WeeklyKpiSnapshot } from "../types/core";
import type { IndustrySimContext } from "../types/industry";
import { getIndustryDefinition } from "../industries/registry";
import { applyWeeklyPayment } from "./loans";
import { makeEntry, dr, cr, round2, accountBalance } from "./ledger";
import { incomeStatementForRange } from "./reports";
import { computeProfitCausal, computeRevenueCausal } from "./causal";
import { buildWeeklyBriefing } from "./briefing";
import { simulateCompetitorsWeek } from "./competitors";
import { advanceEconomy } from "./economy";
import { weekDate } from "./dateUtils";
import { getCash } from "./company";
import { computeManagementSnapshot } from "./management";
import { runDelegatedHiring, runDelegatedPurchasing } from "./delegation";
import { processFacilityConstruction } from "./facilities";
import { processMarketEntries } from "./expansion";
import { processInTransitShipments } from "./logistics";
import { driftRegionalMarket, syncHomeRegion } from "./geography";
import { refreshProspectPool } from "./prospecting";
import { computeCashRunwayWarning, explainLoss } from "./financialExplain";
import { LOCATIONS_BY_ID } from "../data/locations";

function determineStage(employeeCount: number): GameState["company"]["stage"] {
  if (employeeCount === 0) return "founder";
  if (employeeCount < 5) return "small-business";
  if (employeeCount < 15) return "growing-company";
  if (employeeCount < 40) return "established-company";
  if (employeeCount < 100) return "large-company";
  return "corporation";
}

function hasMilestone(company: GameState["company"], headline: string): boolean {
  return company.historyLog.some((h) => h.headline === headline);
}

export function advanceWeek(state: GameState): GameState {
  const newWeek = state.week + 1;
  const date = weekDate(state.company.foundedDate, newWeek);
  const industry = getIndustryDefinition(state.company.industryId);
  if (!industry) throw new Error(`Unknown industry: ${state.company.industryId}`);

  const managementSnapshot = computeManagementSnapshot(state.company, newWeek);
  state.lastManagementSnapshot = managementSnapshot;

  const ctx: IndustrySimContext = {
    company: state.company,
    market: state.market,
    economy: state.economy,
    competitors: state.competitors,
    rng: state.rng,
    week: newWeek,
    date,
    difficulty: state.meta.difficulty,
    founderEffectiveness: managementSnapshot.founderEffectiveness,
    eventFlags: {},
  };

  // Delegated managers act before this week's own simulation runs, so a rebalanced supplier mix or a
  // freshly filled opening is already in effect for the week it's decided in.
  const delegatedDecisions = [
    ...runDelegatedPurchasing(state.company, industry.employeeRoles, newWeek, date),
    ...runDelegatedHiring(state.company, industry.employeeRoles, newWeek, date, state.rng),
  ];
  if (delegatedDecisions.length > 0) {
    state.company.managerDecisionLog = [...delegatedDecisions, ...state.company.managerDecisionLog].slice(0, 60);
  }

  const weekResult = industry.simulateWeek(ctx);
  state.company.entries.push(...weekResult.entries);
  state.company.historyLog.push(...weekResult.historyEvents);
  state.market = weekResult.market;

  // Generic, industry-agnostic post-processing: facilities finishing construction, market entries
  // finishing their ramp-up, inbound internal transfers landing, and every region's own demand drifting.
  state.company.entries.push(...processFacilityConstruction(state.company, newWeek, date));
  processMarketEntries(state.company, newWeek);
  processInTransitShipments(state.company, newWeek);
  syncHomeRegion(state.market, state.company.locationId, state.competitors);
  for (const locId of Object.keys(state.market.regions)) {
    if (locId === state.company.locationId) continue;
    state.market.regions[locId] = driftRegionalMarket(state.market.regions[locId], state.economy, state.competitors, state.rng);
  }
  refreshProspectPool(state.company, industry.customerSegments, newWeek, state.rng);

  // Loan amortization (generic across industries)
  for (const loan of state.company.loans) {
    if (loan.weeksRemaining <= 0 || loan.balance <= 0) continue;
    const split = applyWeeklyPayment(loan);
    state.company.entries.push(
      makeEntry({ week: newWeek, date, memo: `Interest — ${loan.lender}`, source: "loan-payment", lines: [dr("interest-expense", split.interest), cr("cash", split.interest)], cashFlowCategory: "operating" }),
    );
    if (split.principal > 0) {
      state.company.entries.push(
        makeEntry({ week: newWeek, date, memo: `Principal — ${loan.lender}`, source: "loan-payment", lines: [dr("notes-payable", split.principal), cr("cash", split.principal)], cashFlowCategory: "financing" }),
      );
    }
    loan.balance = split.newBalance;
    loan.weeksRemaining -= 1;
  }

  // Taxes: accrue weekly on positive pretax income, pay down quarterly.
  const weekIncomeStatement = incomeStatementForRange(state.company.entries, newWeek, newWeek, "this-week");
  if (weekIncomeStatement.incomeBeforeTax > 0) {
    const location = LOCATIONS_BY_ID[state.company.locationId];
    const combinedRate = 0.21 + (location ? location.corporateTaxRatePct / 100 : 0.06);
    const taxAccrual = round2(weekIncomeStatement.incomeBeforeTax * combinedRate);
    if (taxAccrual > 0.5) {
      state.company.entries.push(
        makeEntry({ week: newWeek, date, memo: "Income tax accrual", source: "tax-accrual", lines: [dr("income-tax-expense", taxAccrual), cr("taxes-payable", taxAccrual)], cashFlowCategory: "noncash" }),
      );
    }
  }
  if (newWeek % 13 === 0) {
    const taxesPayable = accountBalance(state.company.entries, "taxes-payable", newWeek);
    if (taxesPayable > 0.5) {
      state.company.entries.push(
        makeEntry({ week: newWeek, date, memo: "Quarterly estimated tax payment", source: "tax-payment", lines: [dr("taxes-payable", taxesPayable), cr("cash", taxesPayable)], cashFlowCategory: "operating" }),
      );
    }
  }

  // Competitors
  const activeProduct = state.company.products.find((p) => p.active) ?? state.company.products[0];
  const competitorResult = simulateCompetitorsWeek(state.competitors, state.market, state.economy, activeProduct.priceWeekly, newWeek, state.rng);
  state.competitors = competitorResult.active;

  // Economy
  state.economy = advanceEconomy(state.economy, state.rng, state.meta.difficulty);

  // Financials for reporting/causal
  const finalIncomeStatement = incomeStatementForRange(state.company.entries, newWeek, newWeek, "this-week");
  const priorIncomeStatement = incomeStatementForRange(state.company.entries, newWeek - 1, newWeek - 1, "prior-week");
  const priorSnapshot = state.company.kpiHistory[state.company.kpiHistory.length - 1];
  const revenueCausal = computeRevenueCausal(
    priorSnapshot?.avgPrice ?? activeProduct.priceWeekly,
    priorSnapshot?.unitsSold ?? 0,
    activeProduct.priceWeekly,
    activeProduct.unitsSoldLastWeek,
  );
  const profitCausal = computeProfitCausal(priorIncomeStatement, finalIncomeStatement);

  const cash = getCash(state.company, newWeek);
  const employeeCount = state.company.employees.filter((e) => e.status === "active").length;
  const companyCapacityUnits = state.company.facilities.reduce((s, f) => s + f.baseWeeklyCapacityUnits, 0);
  const competitorCapacityUnits = state.competitors.reduce((s, c) => s + c.capacityUnits, 0);
  const marketShareEstimate = companyCapacityUnits + competitorCapacityUnits > 0
    ? round2(companyCapacityUnits / (companyCapacityUnits + competitorCapacityUnits))
    : null;

  const snapshot: WeeklyKpiSnapshot = {
    week: newWeek,
    revenue: finalIncomeStatement.revenue,
    netIncome: finalIncomeStatement.netIncome,
    cash,
    employeeCount,
    customerCount: state.company.customers.length,
    unitsSold: state.company.products.reduce((s, p) => s + p.unitsSoldLastWeek, 0),
    unitsProduced: state.company.products.reduce((s, p) => s + p.unitsProducedLastWeek, 0),
    marketShareEstimate,
    avgPrice: activeProduct.priceWeekly,
  };
  state.company.kpiHistory.push(snapshot);

  // Stage & milestones
  const newStage = determineStage(employeeCount);
  if (newStage !== state.company.stage) {
    const headline = `${state.company.name} reached ${newStage.replace("-", " ")} stage`;
    state.company.historyLog.push({ week: newWeek, date, headline, category: "milestone" });
    state.company.stage = newStage;
  }
  const cumulativeRevenue = incomeStatementForRange(state.company.entries, -1_000_000, newWeek, "cumulative").revenue;
  const milestoneChecks: [number, string][] = [
    [10_000, `${state.company.name} crossed $10,000 in cumulative revenue`],
    [100_000, `${state.company.name} crossed $100,000 in cumulative revenue`],
    [1_000_000, `${state.company.name} crossed $1,000,000 in cumulative revenue`],
  ];
  for (const [threshold, headline] of milestoneChecks) {
    if (cumulativeRevenue >= threshold && !hasMilestone(state.company, headline)) {
      state.company.historyLog.push({ week: newWeek, date, headline, category: "milestone" });
    }
  }

  // Pending decisions
  const decisions: PendingDecision[] = [];
  if (state.company.suppliers.length === 0) {
    decisions.push({
      id: "dec-no-suppliers",
      kind: "no-suppliers",
      week: newWeek,
      title: "You have no raw-material supplier",
      detail: "Production can't run without a source of raw materials. Visit Suppliers to establish your first relationship.",
      severity: "urgent",
    });
  }
  if (state.company.customers.length === 0) {
    const uncontacted = state.company.prospects.filter((p) => p.status === "new" || p.status === "researched").length;
    decisions.push({
      id: "dec-no-customers",
      kind: "no-customers",
      week: newWeek,
      title: "You have no contracted customers yet",
      detail: uncontacted > 0
        ? `Spot-market sales can still happen once you're producing, but ${uncontacted} prospect(s) are waiting to be pitched for real contracted revenue — see Customers.`
        : "Spot-market sales can still happen once you're producing, but real contracted revenue means winning customers — see Customers.",
      severity: "warning",
    });
  }
  const openingIdsAwaitingManagerApproval = new Set(
    state.company.managerDecisionLog
      .filter((d) => d.status === "pending-approval" && d.domain === "hiring")
      .map((d) => d.proposal?.openingId)
      .filter((id): id is string => !!id),
  );
  for (const opening of state.company.openPositions) {
    if (opening.status === "open" && opening.candidates.length > 0 && !openingIdsAwaitingManagerApproval.has(opening.id)) {
      decisions.push({
        id: `dec-hiring-${opening.id}`,
        kind: "review-candidate",
        week: newWeek,
        title: `Candidates waiting for ${opening.title}`,
        detail: `${opening.candidates.length} candidate(s) have applied for the open ${opening.title} position.`,
        severity: "opportunity",
        relatedId: opening.id,
      });
    }
  }
  for (const decision of state.company.managerDecisionLog) {
    if (decision.status !== "pending-approval") continue;
    decisions.push({
      id: `dec-manager-${decision.id}`,
      kind: "manager-decision-pending",
      week: newWeek,
      title: `${decision.managerName} needs sign-off: ${decision.headline}`,
      detail: `${decision.reasoning[0] ?? ""} Involves roughly $${Math.round(decision.amountInvolved).toLocaleString()}, above their current authority. Review on the Management tab.`,
      severity: "warning",
      relatedId: decision.id,
    });
  }
  for (const entry of state.company.enteredMarkets) {
    if (entry.status === "active" && entry.activeFromWeek === newWeek) {
      const location = LOCATIONS_BY_ID[entry.locationId];
      decisions.push({
        id: `dec-market-entry-${entry.id}`,
        kind: "market-entry-ready",
        week: newWeek,
        title: `${location?.city ?? entry.locationId} is now live`,
        detail: `Your ${entry.mode} entry into ${location?.city ?? entry.locationId}, ${location?.state ?? ""} started generating sales this week.`,
        severity: "info",
        relatedId: entry.id,
      });
    }
    if (entry.status === "active" && entry.facilityId) {
      const facility = state.company.facilities.find((f) => f.id === entry.facilityId);
      const localStock = facility
        ? state.company.products.reduce((s, p) => s + (p.facilityInventory[facility.id] ?? 0), 0)
        : 0;
      if (facility && localStock < facility.storageCapacityUnits * 0.08) {
        decisions.push({
          id: `dec-warehouse-${entry.id}`,
          kind: "warehouse-restock-needed",
          week: newWeek,
          title: `${facility.name} is nearly empty`,
          detail: `Only ${Math.round(localStock)} units on hand — transfer inventory in from a factory or sales here will fall back to higher-freight shipments.`,
          severity: "warning",
          relatedId: facility.id,
        });
      }
    }
  }
  for (const facility of state.company.facilities) {
    if (facility.status === "operating" && facility.condition < 45) {
      decisions.push({
        id: `dec-facility-${facility.id}`,
        kind: "facility-maintenance",
        week: newWeek,
        title: `${facility.name} needs attention`,
        detail: `Equipment condition has fallen to ${Math.round(facility.condition)}%. Hiring a maintenance tech or slowing utilization would help.`,
        severity: facility.condition < 30 ? "urgent" : "warning",
      });
    }
  }
  if (activeProduct.unitsUnfulfilledLastWeek > activeProduct.unitsSoldLastWeek * 0.15 && activeProduct.unitsUnfulfilledLastWeek > 10) {
    decisions.push({
      id: "dec-capacity",
      kind: "capacity-constrained",
      week: newWeek,
      title: "Turning away demand",
      detail: `You're leaving roughly ${Math.round(activeProduct.unitsUnfulfilledLastWeek)} ${activeProduct.unitLabel}s of demand on the table each week. Consider capacity, staffing, or inventory buffer.`,
      severity: "opportunity",
    });
  }
  if (managementSnapshot.founderEffectiveness < 0.85) {
    decisions.push({
      id: "dec-management-overload",
      kind: "management-overload",
      week: newWeek,
      title: "You're stretched thin",
      detail: `The company now needs more day-to-day management than you can personally provide — your own effectiveness this week was cut to ${Math.round(managementSnapshot.founderEffectiveness * 100)}%. Promoting or hiring a manager would help.`,
      severity: managementSnapshot.founderEffectiveness < 0.6 ? "urgent" : "warning",
    });
  }
  const weeklyBurnEstimate = finalIncomeStatement.totalOperatingExpenses + finalIncomeStatement.cogs;
  if (weeklyBurnEstimate > 0 && cash < weeklyBurnEstimate * 3) {
    const runway = computeCashRunwayWarning(state.company, newWeek);
    decisions.push({
      id: "dec-cash",
      kind: "cash-warning",
      week: newWeek,
      title: "Cash reserves are thin",
      detail: runway.narrative,
      severity: cash < 0 ? "urgent" : "warning",
    });
  }
  if (finalIncomeStatement.netIncome < -50) {
    const loss = explainLoss(state.company, newWeek);
    decisions.push({
      id: "dec-losing-money",
      kind: "losing-money",
      week: newWeek,
      title: "The company lost money this week",
      detail: loss.narrative,
      severity: finalIncomeStatement.netIncome < -500 ? "urgent" : "warning",
    });
  }
  state.pendingDecisions = decisions;

  // Briefing
  state.lastBriefing = buildWeeklyBriefing({
    week: newWeek,
    companyName: state.company.name,
    incomeStatement: finalIncomeStatement,
    cash,
    revenueCausal,
    industryNotes: weekResult.narrativeNotes,
    competitorNotes: competitorResult.narratives,
    eventNotes: [],
  });
  state.lastRevenueCausal = revenueCausal;
  state.lastProfitCausal = profitCausal;
  state.lastEvaluations = weekResult.evaluations;
  state.recentEventLog = [...weekResult.historyEvents.map((h) => h.headline), ...state.recentEventLog].slice(0, 15);

  state.week = newWeek;
  state.currentDate = date;
  state.meta.lastPlayedAt = new Date().toISOString();

  return state;
}
