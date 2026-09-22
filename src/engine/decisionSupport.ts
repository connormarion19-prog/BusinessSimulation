import type { Company, ProductLine } from "../types/core";
import type { CompetitorCompany } from "../types/competitor";
import type { MarketState } from "../types/industry";
import { round2, accountBalance } from "./ledger";
import { incomeStatementForRange } from "./reports";
import { computeCashRunwayWarning } from "./financialExplain";
import { weeklyPayrollTotal } from "./company";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Inventory coverage (§28-29): how many weeks of runway raw materials and each
// finished-goods line actually have, at current usage — not just a raw unit count.
// ---------------------------------------------------------------------------

export interface InventoryLine {
  label: string;
  unitsOnHand: number;
  avgWeeklyUsage: number;
  weeksCoverage: number | null; // null = usage is zero right now, so coverage isn't a meaningful number
  totalValue: number;
  valuePerUnit: number;
}

export interface InventoryCoverageReport {
  rawMaterials: InventoryLine;
  finishedGoods: InventoryLine[];
}

export function computeInventoryCoverage(company: Company, week: number): InventoryCoverageReport {
  const activeProducts = company.products.filter((p) => p.active);
  const rawMaterialWeeklyUsage = activeProducts.reduce((s, p) => s + p.unitsProducedLastWeek * p.inputUnitsPerProductUnit, 0);
  const rawMaterialsValue = accountBalance(company.entries, "raw-materials", week);
  const rawMaterials: InventoryLine = {
    label: "Raw materials",
    unitsOnHand: company.rawMaterialInventoryUnits,
    avgWeeklyUsage: round2(rawMaterialWeeklyUsage),
    weeksCoverage: rawMaterialWeeklyUsage > 0.5 ? round2(company.rawMaterialInventoryUnits / rawMaterialWeeklyUsage) : null,
    totalValue: round2(Math.max(0, rawMaterialsValue)),
    valuePerUnit: company.rawMaterialInventoryUnits > 0 ? round2(Math.max(0, rawMaterialsValue) / company.rawMaterialInventoryUnits) : 0,
  };

  const finishedGoods: InventoryLine[] = company.products
    .filter((p) => p.inventoryUnits > 0.5 || p.active)
    .map((p) => {
      const totalFgValue = p.fgValueMaterials + p.fgValueLabor + p.fgValueOverhead;
      return {
        label: p.name,
        unitsOnHand: p.inventoryUnits,
        avgWeeklyUsage: p.unitsSoldLastWeek,
        weeksCoverage: p.unitsSoldLastWeek > 0.5 ? round2(p.inventoryUnits / p.unitsSoldLastWeek) : null,
        totalValue: round2(totalFgValue),
        valuePerUnit: p.inventoryUnits > 0 ? round2(totalFgValue / p.inventoryUnits) : 0,
      };
    });

  return { rawMaterials, finishedGoods };
}

// ---------------------------------------------------------------------------
// Price scenarios (§34-35): what would happen at a hypothetical price, as a range,
// using the exact same home-market demand shape weekly.ts's actual sales math uses
// (re-derived here rather than imported, since weekly.ts's version is inline inside
// its own closure — duplicating this one small formula is far lower risk than
// refactoring the tested weekly simulation loop to export it).
// ---------------------------------------------------------------------------

export interface PriceScenarioResult {
  candidatePrice: number;
  estVolumeLow: number;
  estVolumeHigh: number;
  estRevenueLow: number;
  estRevenueHigh: number;
  estGrossProfitLow: number;
  estGrossProfitHigh: number;
  assumedUnitCost: number;
}

export function computePriceScenario(
  company: Company,
  product: ProductLine,
  candidatePrice: number,
  market: MarketState,
  competitors: CompetitorCompany[],
  salesEffectiveness: number,
  categoryShare: number,
): PriceScenarioResult {
  const totalMachineCapacity = company.facilities
    .filter((f) => f.status === "operating")
    .reduce((s, f) => s + f.baseWeeklyCapacityUnits * (f.condition / 100), 0);
  const productCapacity = totalMachineCapacity * product.capacityAllocationPct;
  const competitorCapacity = competitors.reduce((s, c) => s + c.capacityUnits, 0);
  const companyShareOfCapacity = productCapacity > 0 ? productCapacity / (productCapacity + competitorCapacity * categoryShare) : 0;
  const relativePrice = product.referenceMarketPrice > 0 ? candidatePrice / product.referenceMarketPrice : 1;
  const spotShareFactor = clamp(Math.pow(relativePrice, -market.priceElasticity), 0.15, 2.5);
  const homeSpotOrders = market.regionalWeeklyDemandUnits * categoryShare * companyShareOfCapacity * spotShareFactor * salesEffectiveness;

  const contractedCustomers = company.customers.filter((c) => c.productId === product.id);
  let contractedOrders = 0;
  for (const customer of contractedCustomers) {
    const priceAcceptance = clamp(1 - customer.priceSensitivity * (relativePrice - 1), 0.2, 1.3);
    contractedOrders += (customer.annualVolumeUnits / 52) * priceAcceptance * (customer.relationshipStrength / 100);
  }

  const estVolumeMid = round2(homeSpotOrders + contractedOrders);
  const capacityCap = Math.max(0, productCapacity);
  const estVolumeLow = round2(Math.min(capacityCap, Math.max(0, estVolumeMid * 0.85)));
  const estVolumeHigh = round2(Math.min(capacityCap, estVolumeMid * 1.15));

  const totalFgValue = product.fgValueMaterials + product.fgValueLabor + product.fgValueOverhead;
  const assumedUnitCost = product.inventoryUnits > 0 ? round2(totalFgValue / product.inventoryUnits) : 0;

  return {
    candidatePrice,
    estVolumeLow,
    estVolumeHigh,
    estRevenueLow: round2(estVolumeLow * candidatePrice),
    estRevenueHigh: round2(estVolumeHigh * candidatePrice),
    estGrossProfitLow: round2(estVolumeLow * (candidatePrice - assumedUnitCost)),
    estGrossProfitHigh: round2(estVolumeHigh * (candidatePrice - assumedUnitCost)),
    assumedUnitCost,
  };
}

// ---------------------------------------------------------------------------
// Break-even & contribution margin (§38-40). Only raw materials (and any per-unit
// freight/commission) are treated as genuinely variable — direct labor and
// manufacturing overhead are salaried/leased in this game, not paid per unit, so
// they're treated as a fixed (or step-fixed) cost here rather than folded into
// "variable cost," and that distinction is surfaced explicitly rather than hidden.
// ---------------------------------------------------------------------------

export interface BreakEvenAnalysis {
  productId: string;
  productName: string;
  pricePerUnit: number;
  variableCostPerUnit: number;
  contributionMarginPerUnit: number;
  contributionMarginPct: number | null;
  fixedCostsWeekly: number;
  breakEvenUnitsWeekly: number | null;
  currentWeeklyVolume: number;
  aboveBreakEven: boolean | null;
  narrative: string;
}

export function computeBreakEven(company: Company, product: ProductLine, week: number): BreakEvenAnalysis {
  const is = incomeStatementForRange(company.entries, week, week, "this week");
  const materialCostThisWeek = -accountActivity(company.entries, "cogs-materials", week, week, product.id);
  const laborCostThisWeek = -accountActivity(company.entries, "cogs-labor", week, week, product.id);
  const overheadCostThisWeek = -accountActivity(company.entries, "cogs-overhead", week, week, product.id);
  const freightThisWeek = -accountActivity(company.entries, "freight-expense", week, week, product.id);
  const commissionThisWeek = -accountActivity(company.entries, "distributor-commission-expense", week, week, product.id);

  const unitsSold = product.unitsSoldLastWeek;
  const variableCostPerUnit = unitsSold > 0.5 ? round2((materialCostThisWeek + freightThisWeek + commissionThisWeek) / unitsSold) : 0;
  const contributionMarginPerUnit = round2(product.priceWeekly - variableCostPerUnit);

  // This product's share of company-wide fixed operating costs, weighted by its share of this week's
  // revenue (a simple, disclosed allocation — not an exact cost-accounting apportionment).
  const revenueShare = is.revenue > 0.5 ? clamp((unitsSold * product.priceWeekly) / is.revenue, 0, 1) : company.products.filter((p) => p.active).length > 0 ? 1 / company.products.filter((p) => p.active).length : 1;
  const fixedCostsWeekly = round2((laborCostThisWeek + overheadCostThisWeek + is.totalOperatingExpenses + is.interestExpense) * revenueShare);

  const breakEvenUnitsWeekly = contributionMarginPerUnit > 0.01 ? round2(fixedCostsWeekly / contributionMarginPerUnit) : null;
  const aboveBreakEven = breakEvenUnitsWeekly !== null ? unitsSold >= breakEvenUnitsWeekly : null;

  let narrative: string;
  if (contributionMarginPerUnit <= 0) {
    narrative = `Every unit of ${product.name} currently loses $${Math.abs(contributionMarginPerUnit).toFixed(2)} before fixed costs are even considered — no volume of sales fixes this; price or material cost has to change first.`;
  } else if (breakEvenUnitsWeekly === null) {
    narrative = `${product.name} contributes $${contributionMarginPerUnit.toFixed(2)}/unit, but there isn't enough fixed-cost data yet this week to compute a break-even volume.`;
  } else {
    narrative = `${product.name} needs to sell about ${Math.ceil(breakEvenUnitsWeekly).toLocaleString()} units/week to cover its share of fixed costs — this week it sold ${Math.round(unitsSold).toLocaleString()}, ${aboveBreakEven ? "above" : "below"} that line.`;
  }

  return {
    productId: product.id,
    productName: product.name,
    pricePerUnit: product.priceWeekly,
    variableCostPerUnit,
    contributionMarginPerUnit,
    contributionMarginPct: product.priceWeekly > 0 ? round2((contributionMarginPerUnit / product.priceWeekly) * 100) : null,
    fixedCostsWeekly,
    breakEvenUnitsWeekly,
    currentWeeklyVolume: unitsSold,
    aboveBreakEven,
    narrative,
  };
}

function accountActivity(entries: Company["entries"], accountId: string, startWeek: number, endWeek: number, productId?: string): number {
  let net = 0;
  for (const e of entries) {
    if (e.week < startWeek || e.week > endWeek) continue;
    if (productId && e.productId !== productId) continue;
    for (const l of e.lines) {
      if (l.accountId !== accountId) continue;
      net += l.credit - l.debit;
    }
  }
  return net;
}

// ---------------------------------------------------------------------------
// Cash flow forecast (§41-42): an explicit multi-week projection with ranges,
// built from the exact same real weekly-burn components computeCashRunwayWarning
// already exposes — not a second, inconsistent cash model.
// ---------------------------------------------------------------------------

export interface CashForecastWeek {
  week: number;
  projectedCollections: number;
  projectedSupplierPayments: number;
  projectedPayroll: number;
  projectedDebtService: number;
  projectedCashLow: number;
  projectedCashMid: number;
  projectedCashHigh: number;
}

export interface CashFlowForecast {
  startingCash: number;
  weeks: CashForecastWeek[];
  narrative: string;
}

export function computeCashFlowForecast(company: Company, week: number, weeksAhead = 8): CashFlowForecast {
  const runway = computeCashRunwayWarning(company, week);
  const payroll = weeklyPayrollTotal(company);
  const weeks: CashForecastWeek[] = [];
  let cashMid = runway.cash;
  let cashLow = runway.cash;
  let cashHigh = runway.cash;

  for (let i = 1; i <= weeksAhead; i++) {
    const uncertainty = clamp(0.06 + i * 0.02, 0.06, 0.35); // widens the further out the projection reaches
    const netMid = runway.weeklyCollections - runway.weeklySupplierPayments - payroll - runway.weeklyDebtService;
    cashMid = round2(cashMid + netMid);
    cashLow = round2(cashLow + netMid - Math.abs(netMid || (payroll + runway.weeklySupplierPayments)) * uncertainty);
    cashHigh = round2(cashHigh + netMid + Math.abs(netMid || (payroll + runway.weeklySupplierPayments)) * uncertainty);
    weeks.push({
      week: week + i,
      projectedCollections: runway.weeklyCollections,
      projectedSupplierPayments: runway.weeklySupplierPayments,
      projectedPayroll: payroll,
      projectedDebtService: runway.weeklyDebtService,
      projectedCashLow: cashLow,
      projectedCashMid: cashMid,
      projectedCashHigh: cashHigh,
    });
  }

  const dipsNegative = weeks.some((w) => w.projectedCashMid < 0);
  const firstNegativeWeek = weeks.find((w) => w.projectedCashMid < 0)?.week;
  const narrative = dipsNegative
    ? `At current run-rate, projected cash goes negative around week ${firstNegativeWeek} — this assumes payroll, supplier payments, and debt service continue at their recent pace while collections don't improve.`
    : `Projected cash stays positive through the next ${weeksAhead} weeks at the current run-rate of collections, supplier payments, payroll, and debt service.`;

  return { startingCash: runway.cash, weeks, narrative };
}
