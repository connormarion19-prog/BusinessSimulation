import type { Company, CustomerAccount, CustomerPitch, PitchResult, Prospect } from "../types/core";
import type { CustomerSegmentTemplate } from "../types/industry";
import type { RngState } from "./rng";
import { nextRange, pick, chance } from "./rng";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { LOCATIONS, LOCATIONS_BY_ID } from "../data/locations";

const PROSPECT_NAME_PREFIXES = ["Midwest", "Lakeshore", "Heartland", "Union", "Crestview", "Summit", "Parkway", "Northfield", "Ironbridge", "Fairhaven"];
const PROSPECT_NAME_SUFFIXES = ["Office Supply", "Distribution", "Wholesale Partners", "Print & Copy", "Converting Co.", "Supply Partners", "Materials Group", "Trading Co."];
const OUTREACH_COST = 90;

function randomProspectName(rng: RngState): string {
  return `${pick(rng, PROSPECT_NAME_PREFIXES)} ${pick(rng, PROSPECT_NAME_SUFFIXES)}`;
}

function generateOneProspect(segment: CustomerSegmentTemplate, homeLocationId: string, week: number, rng: RngState): Prospect {
  const trueAnnualVolumeUnits = Math.round(nextRange(rng, segment.typicalAnnualVolumeUnits[0], segment.typicalAnnualVolumeUnits[1]));
  const trueWillingnessToPayPerUnit = round2(nextRange(rng, 0.85, 1.15) * 10); // anchored loosely; real fit is judged against actual product price at pitch time
  const truePriceSensitivity = Math.max(0.1, Math.min(0.95, segment.priceSensitivity + nextRange(rng, -0.1, 0.1)));
  const trueQualityExpectation = Math.max(0.1, Math.min(0.95, segment.qualityExpectation + nextRange(rng, -0.08, 0.08)));
  const truePaymentTermsDays = Math.max(14, Math.round(segment.paymentTermsDays + nextRange(rng, -10, 10)));
  const locationId = chance(rng, 0.7) ? homeLocationId : pick(rng, LOCATIONS).id;
  const location = LOCATIONS_BY_ID[locationId];

  // The estimate the player actually sees is deliberately imprecise — a wide band around the truth.
  const volSpread = trueAnnualVolumeUnits * 0.35;
  const wtpSpread = trueWillingnessToPayPerUnit * 0.25;

  return {
    id: `prospect-${week}-${Math.round(Math.random() * 1e6)}`,
    name: randomProspectName(rng),
    location: location ? `${location.city}, ${location.state}` : "Regional",
    locationId,
    industryNote: segment.name,
    segment: segment.id,
    estimate: {
      annualVolumeRangeUnits: [Math.max(50, Math.round(trueAnnualVolumeUnits - volSpread)), Math.round(trueAnnualVolumeUnits + volSpread)],
      willingnessToPayRangePerUnit: [round2(Math.max(0.5, trueWillingnessToPayPerUnit - wtpSpread)), round2(trueWillingnessToPayPerUnit + wtpSpread)],
      probabilityOfInterestPct: Math.round(nextRange(rng, 15, 55)),
    },
    trueAnnualVolumeUnits,
    trueWillingnessToPayPerUnit,
    truePriceSensitivity,
    trueQualityExpectation,
    truePaymentTermsDays,
    status: "new",
    researched: false,
    discoveredWeek: week,
    lastContactWeek: null,
    contactAttempts: 0,
  };
}

/** Seeds a starting pool of prospects for a brand-new company — real leads to chase, not customers already in hand. */
export function generateInitialProspectPool(segments: CustomerSegmentTemplate[], homeLocationId: string, week: number, rng: RngState, count = 8): Prospect[] {
  const prospects: Prospect[] = [];
  for (let i = 0; i < count; i++) {
    const segment = pick(rng, segments);
    prospects.push(generateOneProspect(segment, homeLocationId, week, rng));
  }
  return prospects;
}

/** Weekly: keeps a modest, organic trickle of new prospects appearing so the pool never runs dry. */
export function refreshProspectPool(company: Company, segments: CustomerSegmentTemplate[], week: number, rng: RngState, minOpen = 4, maxPerWeek = 1): void {
  const open = company.prospects.filter((p) => p.status !== "won" && p.status !== "lost").length;
  if (open >= minOpen) return;
  if (!chance(rng, 0.25)) return;
  for (let i = 0; i < maxPerWeek; i++) {
    const segment = pick(rng, segments);
    company.prospects.push(generateOneProspect(segment, company.locationId, week, rng));
  }
}

export interface ResearchResult {
  ok: boolean;
  entries: import("../types/finance").JournalEntry[];
  reason?: string;
}

/** Spends a little time/money digging into a prospect, narrowing the visible estimate toward the truth without ever revealing it exactly. */
export function researchProspect(company: Company, prospectId: string, week: number, date: string): ResearchResult {
  const prospect = company.prospects.find((p) => p.id === prospectId);
  if (!prospect) return { ok: false, entries: [], reason: "Unknown prospect." };
  if (prospect.status === "won" || prospect.status === "lost") return { ok: false, entries: [], reason: "This prospect is no longer active." };
  const cost = 60;
  prospect.researched = true;
  if (prospect.status === "new") prospect.status = "researched";
  const volSpread = prospect.trueAnnualVolumeUnits * 0.12;
  const wtpSpread = prospect.trueWillingnessToPayPerUnit * 0.08;
  prospect.estimate = {
    annualVolumeRangeUnits: [Math.max(50, Math.round(prospect.trueAnnualVolumeUnits - volSpread)), Math.round(prospect.trueAnnualVolumeUnits + volSpread)],
    willingnessToPayRangePerUnit: [round2(Math.max(0.5, prospect.trueWillingnessToPayPerUnit - wtpSpread)), round2(prospect.trueWillingnessToPayPerUnit + wtpSpread)],
    probabilityOfInterestPct: prospect.estimate.probabilityOfInterestPct,
  };
  const entries = [
    makeEntry({ week, date, memo: `Market research — ${prospect.name}`, source: "sales-research", lines: [dr("marketing-expense", cost), cr("cash", cost)], cashFlowCategory: "operating" }),
  ];
  return { ok: true, entries };
}

/**
 * Pitches a prospect with real, player-chosen terms. The outcome is computed from how the offer
 * actually compares to the prospect's hidden willingness-to-pay/price sensitivity/quality bar, the
 * company's sales capability, and simple competitive/market noise — never a coin flip divorced from
 * the offer made.
 */
export function pitchProspect(
  company: Company,
  prospectId: string,
  pitch: CustomerPitch,
  salesSkillFactor: number, // ~0.5-1.6, from the real sales-function effective-capacity/coverage the caller already computed
  productQualityFactor: number, // ~0.3-1.0 proxy for how well the company's product/reputation matches expectations
  week: number,
  date: string,
  rng: RngState,
): PitchResult {
  const prospect = company.prospects.find((p) => p.id === prospectId);
  const product = company.products.find((p) => p.id === pitch.productId);
  if (!prospect) return { ok: false, won: false, reason: "Unknown prospect.", entries: [] };
  if (!product) return { ok: false, won: false, reason: "Unknown product.", entries: [] };
  if (prospect.status === "won" || prospect.status === "lost") return { ok: false, won: false, reason: "This prospect is no longer active.", entries: [] };

  prospect.contactAttempts += 1;
  prospect.lastContactWeek = week;
  prospect.status = "contacted";

  const entries = [
    makeEntry({ week, date, memo: `Sales outreach — ${prospect.name}`, source: "sales-outreach", lines: [dr("marketing-expense", OUTREACH_COST), cr("cash", OUTREACH_COST)], cashFlowCategory: "operating" }),
  ];

  const priceRatio = pitch.priceOffered / Math.max(0.5, prospect.trueWillingnessToPayPerUnit);
  const priceFit = Math.max(0, 1 - Math.max(0, priceRatio - 1) * (0.6 + prospect.truePriceSensitivity));
  const volumeFit = Math.min(1, pitch.volumeCommitmentUnits / Math.max(1, prospect.trueAnnualVolumeUnits * 0.4));
  const termsFit = pitch.paymentTermsDaysOffered >= prospect.truePaymentTermsDays ? 1 : 0.25;
  const qualityFit = Math.max(0.2, Math.min(1.15, productQualityFactor / Math.max(0.2, prospect.trueQualityExpectation)));

  const baseCloseProbability =
    0.04 +
    priceFit * 0.5 +
    volumeFit * 0.08 +
    termsFit * 0.06 +
    Math.min(1, qualityFit) * 0.1 +
    Math.max(0, salesSkillFactor - 0.5) * 0.22;

  const attemptFatigue = Math.max(0, (prospect.contactAttempts - 1) * 0.06); // repeated identical pitches don't help much
  const closeProbability = Math.max(0.02, Math.min(0.92, baseCloseProbability - attemptFatigue));

  const won = chance(rng, closeProbability);

  if (won) {
    prospect.status = "won";
    const customer: CustomerAccount = {
      id: `cust-${week}-${Math.round(Math.random() * 1e6)}`,
      name: prospect.name,
      productId: pitch.productId,
      segment: prospect.segment,
      location: prospect.location,
      locationId: prospect.locationId,
      annualVolumeUnits: Math.round((pitch.volumeCommitmentUnits + prospect.trueAnnualVolumeUnits) / 2),
      priceSensitivity: prospect.truePriceSensitivity,
      qualityExpectation: prospect.trueQualityExpectation,
      paymentTermsDays: pitch.paymentTermsDaysOffered,
      relationshipStrength: 55,
      contractedSince: week,
      lastOrderWeek: null,
      atRisk: false,
    };
    company.customers.push(customer);
    prospect.wonCustomerId = customer.id;
    company.historyLog.push({
      week,
      date,
      headline: `Won ${prospect.name} as a customer`,
      detail: `Signed at $${pitch.priceOffered.toFixed(2)}/unit, ~${pitch.volumeCommitmentUnits.toLocaleString()} units/yr committed, ${pitch.paymentTermsDaysOffered}-day terms.`,
      category: "market",
    });
    return { ok: true, won: true, reason: "Closed the deal.", entries };
  }

  let reason: string;
  if (priceFit < 0.4) reason = "Price came in too high relative to what they were willing to pay.";
  else if (qualityFit < 0.6) reason = "They weren't convinced the product met their quality bar.";
  else if (volumeFit < 0.3) reason = "The volume commitment didn't match what they were looking to buy.";
  else reason = "They passed for now — sometimes a well-matched pitch still doesn't land.";
  prospect.lostReason = reason;
  if (prospect.contactAttempts >= 3) prospect.status = "lost";
  else prospect.status = "researched";
  company.historyLog.push({ week, date, headline: `Lost the pitch to ${prospect.name}`, detail: reason, category: "market" });
  return { ok: true, won: false, reason, entries };
}
