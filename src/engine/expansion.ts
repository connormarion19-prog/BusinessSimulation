import type { Company, ExpansionForecast, MarketEntry, MarketEntryMode } from "../types/core";
import type { CompetitorCompany } from "../types/competitor";
import type { IndustryDefinition, MarketState, RegionalMarketState } from "../types/industry";
import type { JournalEntry } from "../types/finance";
import type { RngState } from "./rng";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { seedRegionalMarket, estimateCompetitivePressure } from "./geography";
import { openFacilityForCompany, type FacilityFinancing } from "./facilities";
import type { FacilityOwnershipType } from "../types/core";
import { LOCATIONS_BY_ID } from "../data/locations";

const REMOTE_SETUP_COST = 4_000;
const DISTRIBUTOR_SETUP_COST = 15_000;
const REMOTE_ACTIVE_LAG_WEEKS = 1;
const DISTRIBUTOR_ACTIVE_LAG_WEEKS = 6;
const WAREHOUSE_MIN_LAG_WEEKS = 3;
const FACILITY_MIN_LAG_WEEKS = 4;

const MODE_SHARE_MIDPOINT: Record<MarketEntryMode, number> = {
  remote: 0.035,
  distributor: 0.065,
  warehouse: 0.1,
  facility: 0.17,
};
const MODE_MARGIN_MIDPOINT: Record<MarketEntryMode, number> = {
  remote: 0.04,
  distributor: 0.065,
  warehouse: 0.1,
  facility: 0.14,
};

/**
 * Builds a real feasibility estimate from the actual regional-market model — not a canned number.
 * Ranges reflect genuine uncertainty (nobody knows the true share or margin in advance); the game
 * never reveals the "true" figures, only these estimates, and the actual outcome can fall outside them.
 */
export function estimateExpansionForecast(
  region: RegionalMarketState,
  mode: MarketEntryMode,
  investment: number,
): ExpansionForecast {
  const location = LOCATIONS_BY_ID[region.locationId];
  const annualMarketSize = round2(region.weeklyDemandUnits * 52 * region.avgMarketPrice);
  const midShare = MODE_SHARE_MIDPOINT[mode];
  const shareLow = midShare * 0.5;
  const shareHigh = midShare * 1.7;
  const competitivePenalty = 1 - region.competitivePressure * 0.35;

  const revenueLow = round2(annualMarketSize * shareLow * competitivePenalty);
  const revenueHigh = round2(annualMarketSize * shareHigh * Math.max(0.5, 1 - region.competitivePressure * 0.1));

  const midMargin = MODE_MARGIN_MIDPOINT[mode];
  const marginLow = round2(Math.max(-0.05, midMargin - 0.06));
  const marginHigh = round2(midMargin + 0.05);

  const bestCaseAnnualProfit = Math.max(1, revenueHigh * marginHigh);
  const worstCaseAnnualProfit = Math.max(1, revenueLow * Math.max(0.01, marginLow));
  const breakEvenLow = round2(investment / bestCaseAnnualProfit);
  const breakEvenHigh = round2(investment / worstCaseAnnualProfit);

  const risks: string[] = [];
  if (region.competitivePressure > 0.55) risks.push("Established competitors already have a meaningful presence in this market.");
  else if (region.competitivePressure > 0.3) risks.push("Some existing competition — expect a harder fight for share than an open market.");
  if (location && location.laborCostIndex > 1.05) risks.push("Above-average local labor costs will pressure margins here.");
  if (mode === "facility" || mode === "warehouse") risks.push("Capital is committed up front; demand or competitive response could undershoot the estimate.");
  if (mode === "remote") risks.push("No local presence means slower response to local competitors and higher per-unit freight.");
  if (mode === "distributor") risks.push("Distributor margin is a permanent cost of this channel, and you don't own the customer relationship directly.");
  risks.push("Demand estimates are regional averages — actual local conditions may differ from the estimate.");

  return {
    estimatedMarketSizeLow: round2(annualMarketSize * 0.85),
    estimatedMarketSizeHigh: round2(annualMarketSize * 1.15),
    expectedFirstYearRevenueLow: revenueLow,
    expectedFirstYearRevenueHigh: revenueHigh,
    expectedOperatingMarginLow: marginLow,
    expectedOperatingMarginHigh: marginHigh,
    requiredInvestmentLow: round2(investment * 0.85),
    requiredInvestmentHigh: round2(investment * 1.25),
    estimatedBreakEvenYearsLow: Math.max(0.25, breakEvenLow),
    estimatedBreakEvenYearsHigh: Math.max(0.5, breakEvenHigh),
    risks,
  };
}

/** Deterministic, non-mutating estimate of a region's demand/price — used for the UI's expansion-screen preview so simply browsing options never touches the game's RNG or seeds real market state early. */
export function previewRegionalMarket(
  market: MarketState,
  competitors: CompetitorCompany[],
  locationId: string,
): RegionalMarketState {
  const existing = market.regions[locationId];
  if (existing) return existing;
  const location = LOCATIONS_BY_ID[locationId];
  const multiplier = location?.regionalDemandMultiplier ?? 1;
  const weeklyDemandUnits = round2(market.regionalWeeklyDemandUnits * multiplier);
  return {
    locationId,
    weeklyDemandUnits,
    estimatedDemandRangeUnits: [round2(weeklyDemandUnits * 0.85), round2(weeklyDemandUnits * 1.15)],
    avgMarketPrice: market.avgMarketPrice,
    competitivePressure: estimateCompetitivePressure(competitors, locationId, weeklyDemandUnits),
  };
}

/** Non-mutating estimate of the up-front capital a given entry mode would need — mirrors enterMarket's own sizing without actually opening anything. */
export function previewEntryInvestment(
  industry: IndustryDefinition,
  mode: MarketEntryMode,
  locationId: string,
  ownershipType: FacilityOwnershipType = "lease",
): number {
  const location = LOCATIONS_BY_ID[locationId];
  const rentIndex = location?.commercialRentIndex ?? 1;
  if (mode === "remote") return REMOTE_SETUP_COST;
  if (mode === "distributor") return DISTRIBUTOR_SETUP_COST;
  const template = industry.facilityTemplates.find((t) => t.role === (mode === "warehouse" ? "distribution" : "production"));
  if (!template) return 0;
  const purchaseValue = round2(template.purchaseValue * rentIndex);
  return ownershipType === "lease" ? round2(template.weeklyLeaseCost * rentIndex * 4) : purchaseValue;
}

export interface EnterMarketParams {
  locationId: string;
  productId: string;
  mode: MarketEntryMode;
  facilityTemplateId?: string;
  ownershipType?: FacilityOwnershipType;
  financing?: FacilityFinancing;
}

export interface EnterMarketResult {
  ok: boolean;
  entries: JournalEntry[];
  entry?: MarketEntry;
  reason?: string;
}

/** Builds (or reuses) the regional-market record for a location the company is about to sell into. */
export function ensureRegionSeeded(
  market: MarketState,
  locationId: string,
  competitors: CompetitorCompany[],
  rng: RngState,
): RegionalMarketState {
  const existing = market.regions[locationId];
  if (existing) return existing;
  const seeded = seedRegionalMarket(locationId, market.regionalWeeklyDemandUnits, market.avgMarketPrice, competitors, rng);
  market.regions[locationId] = seeded;
  return seeded;
}

export function enterMarket(
  company: Company,
  industry: IndustryDefinition,
  market: MarketState,
  competitors: CompetitorCompany[],
  params: EnterMarketParams,
  week: number,
  date: string,
  rng: RngState,
): EnterMarketResult {
  const product = company.products.find((p) => p.id === params.productId);
  if (!product) return { ok: false, entries: [], reason: "Unknown product." };
  if (company.enteredMarkets.some((m) => m.locationId === params.locationId && m.productId === params.productId && m.status !== "exited")) {
    return { ok: false, entries: [], reason: "Already active or entering this market for this product." };
  }

  const region = ensureRegionSeeded(market, params.locationId, competitors, rng);
  const location = LOCATIONS_BY_ID[params.locationId];
  const entries: JournalEntry[] = [];
  let investment = 0;
  let activeFromWeek = week;
  let facilityId: string | undefined;

  if (params.mode === "remote") {
    investment = REMOTE_SETUP_COST;
    activeFromWeek = week + REMOTE_ACTIVE_LAG_WEEKS;
    entries.push(
      makeEntry({
        week,
        date,
        memo: `Remote-sales entry into ${location?.city ?? params.locationId}`,
        source: "market-entry",
        lines: [dr("marketing-expense", investment), cr("cash", investment)],
        cashFlowCategory: "operating",
      }),
    );
  } else if (params.mode === "distributor") {
    investment = DISTRIBUTOR_SETUP_COST;
    activeFromWeek = week + DISTRIBUTOR_ACTIVE_LAG_WEEKS;
    entries.push(
      makeEntry({
        week,
        date,
        memo: `Distributor agreement signed — ${location?.city ?? params.locationId}`,
        source: "market-entry",
        lines: [dr("marketing-expense", investment), cr("cash", investment)],
        cashFlowCategory: "operating",
      }),
    );
  } else if (params.mode === "warehouse" || params.mode === "facility") {
    const templateId =
      params.facilityTemplateId ??
      (params.mode === "warehouse"
        ? industry.facilityTemplates.find((t) => t.role === "distribution")?.id
        : industry.facilityTemplates.find((t) => t.role === "production")?.id);
    if (!templateId) return { ok: false, entries: [], reason: "No suitable facility template for this entry mode." };
    const result = openFacilityForCompany(
      company,
      industry,
      templateId,
      params.locationId,
      week,
      date,
      params.ownershipType ?? "lease",
      params.financing ?? "cash",
    );
    if (!result.ok || !result.facility) return { ok: false, entries: [], reason: result.reason ?? "Could not open facility." };
    entries.push(...result.entries);
    investment = result.facility.purchaseValue > 0 ? result.facility.purchaseValue : result.facility.weeklyLeaseCost * 4;
    facilityId = result.facility.id;
    const minLag = params.mode === "warehouse" ? WAREHOUSE_MIN_LAG_WEEKS : FACILITY_MIN_LAG_WEEKS;
    const constructionLag = result.facility.constructionCompleteWeek ? result.facility.constructionCompleteWeek - week : 0;
    activeFromWeek = week + Math.max(minLag, constructionLag);
    for (const p of company.products) {
      if (p.facilityInventory[result.facility.id] === undefined) p.facilityInventory[result.facility.id] = 0;
    }
  }

  const forecast = estimateExpansionForecast(region, params.mode, investment);
  const entry: MarketEntry = {
    id: `market-entry-${week}-${Math.round(Math.random() * 1e6)}`,
    locationId: params.locationId,
    productId: params.productId,
    mode: params.mode,
    status: "entering",
    enteredWeek: week,
    enteredDate: date,
    activeFromWeek,
    investment,
    facilityId,
    forecast,
    actualRevenueToDate: 0,
    actualWeeksActive: 0,
  };
  company.enteredMarkets.push(entry);
  company.historyLog.push({
    week,
    date,
    headline: `Decided to enter ${location?.city ?? params.locationId}, ${location?.state ?? ""} via ${params.mode}`,
    detail: `Forecast first-year revenue $${Math.round(forecast.expectedFirstYearRevenueLow).toLocaleString()}–$${Math.round(forecast.expectedFirstYearRevenueHigh).toLocaleString()}, required investment ~$${Math.round(investment).toLocaleString()}. Expected to start generating sales around week ${activeFromWeek}.`,
    category: "expansion",
  });

  return { ok: true, entries, entry };
}

/** Weekly: flips any entry whose ramp-up period has elapsed to active. */
export function processMarketEntries(company: Company, week: number): void {
  for (const entry of company.enteredMarkets) {
    if (entry.status === "entering" && week >= entry.activeFromWeek) {
      entry.status = "active";
    }
  }
}

export function exitMarket(company: Company, entryId: string, week: number, date: string): boolean {
  const entry = company.enteredMarkets.find((e) => e.id === entryId);
  if (!entry || entry.status === "exited") return false;
  entry.status = "exited";
  entry.exitedWeek = week;
  const location = LOCATIONS_BY_ID[entry.locationId];
  company.historyLog.push({
    week,
    date,
    headline: `Exited the ${location?.city ?? entry.locationId} market`,
    detail: `After ${entry.actualWeeksActive} active week(s), generated $${Math.round(entry.actualRevenueToDate).toLocaleString()} in cumulative revenue against a forecast of $${Math.round(entry.forecast.expectedFirstYearRevenueLow).toLocaleString()}–$${Math.round(entry.forecast.expectedFirstYearRevenueHigh).toLocaleString()} for the first year.`,
    category: "expansion",
  });
  return true;
}
