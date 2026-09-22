import type { Company, CustomerAccount, CustomerPitch, OutreachMethod, PitchResult, Prospect } from "../types/core";
import type { CustomerSegmentTemplate } from "../types/industry";
import type { RngState } from "./rng";
import { nextRange, pick, chance } from "./rng";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { LOCATIONS, LOCATIONS_BY_ID } from "../data/locations";
import { recordMilestoneOnce } from "./milestones";

const PROSPECT_NAME_PREFIXES = ["Midwest", "Lakeshore", "Heartland", "Union", "Crestview", "Summit", "Parkway", "Northfield", "Ironbridge", "Fairhaven"];
const PROSPECT_NAME_SUFFIXES = ["Office Supply", "Distribution", "Wholesale Partners", "Print & Copy", "Converting Co.", "Supply Partners", "Materials Group", "Trading Co."];

/** Cost and base effectiveness of each outreach method — a real, disclosed tradeoff, not flavor text. */
export const OUTREACH_METHODS: Record<OutreachMethod, { label: string; cost: number; baseAdvanceChance: number; description: string }> = {
  "cold-outreach": { label: "Cold Outreach", cost: 25, baseAdvanceChance: 0.32, description: "Cheapest option. Low odds of a response, but costs almost nothing to try." },
  email: { label: "Email", cost: 15, baseAdvanceChance: 0.28, description: "Cheap and low-effort. Slightly lower odds than a cold call, but nearly free to repeat." },
  "phone-call": { label: "Phone Call", cost: 55, baseAdvanceChance: 0.48, description: "A real conversation. Meaningfully better odds than email or cold outreach." },
  "in-person-meeting": { label: "In-Person Meeting", cost: 160, baseAdvanceChance: 0.68, description: "Expensive and time-consuming, but by far the best odds of getting real interest." },
};

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
  const hasCurrentSupplier = chance(rng, 0.55);
  const buyingFrequencyWeeks = Math.round(nextRange(rng, 2, 13));

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
    hasCurrentSupplier,
    buyingFrequencyWeeks,
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
    outreachHistory: [],
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

export interface ContactResult {
  ok: boolean;
  advanced: boolean;
  reason: string;
  entries: import("../types/finance").JournalEntry[];
}

/**
 * Outreach step of the funnel: new/researched/contacted -> interested. The method chosen genuinely
 * changes cost and odds — this is a real lever, not flavor text. A failed attempt doesn't lose the
 * prospect outright (repeated fatigue still applies via contactAttempts, same as the pitch step).
 */
export function contactProspect(
  company: Company,
  prospectId: string,
  method: OutreachMethod,
  salesSkillFactor: number,
  week: number,
  date: string,
  rng: RngState,
): ContactResult {
  const prospect = company.prospects.find((p) => p.id === prospectId);
  if (!prospect) return { ok: false, advanced: false, reason: "Unknown prospect.", entries: [] };
  if (!["new", "researched", "contacted"].includes(prospect.status)) {
    return { ok: false, advanced: false, reason: "This prospect has already been contacted successfully.", entries: [] };
  }
  const methodInfo = OUTREACH_METHODS[method];
  const entries = [
    makeEntry({ week, date, memo: `${methodInfo.label} — ${prospect.name}`, source: "sales-outreach", lines: [dr("marketing-expense", methodInfo.cost), cr("cash", methodInfo.cost)], cashFlowCategory: "operating" }),
  ];

  prospect.contactAttempts += 1;
  prospect.lastContactWeek = week;
  if (prospect.status !== "contacted") prospect.status = "contacted";

  const interestFactor = prospect.estimate.probabilityOfInterestPct / 100;
  const researchBonus = prospect.researched ? 0.1 : 0;
  const supplierPenalty = prospect.hasCurrentSupplier ? -0.15 : 0;
  const skillBonus = (salesSkillFactor - 0.8) * 0.2;
  const attemptFatigue = Math.max(0, (prospect.contactAttempts - 1) * 0.08);
  const advanceChance = Math.max(0.03, Math.min(0.9, methodInfo.baseAdvanceChance + interestFactor * 0.3 + researchBonus + supplierPenalty + skillBonus - attemptFatigue));

  const advanced = chance(rng, advanceChance);
  if (advanced) {
    prospect.status = "interested";
    prospect.outreachHistory.push({ week, method, outcome: "advanced" });
    return { ok: true, advanced: true, reason: `${prospect.name} responded and is willing to hear more.`, entries };
  }
  prospect.outreachHistory.push({ week, method, outcome: "no-response" });
  if (prospect.contactAttempts >= 4) {
    prospect.status = "lost";
    prospect.lostReason = "Never responded after repeated outreach.";
    return { ok: true, advanced: false, reason: `${prospect.name} never responded — giving up after ${prospect.contactAttempts} attempts.`, entries };
  }
  return { ok: true, advanced: false, reason: `No response yet from ${prospect.name}. Try again, maybe with a different method.`, entries };
}

export interface QualifyResult {
  ok: boolean;
  qualified: boolean;
  reason: string;
}

/** Confirms the prospect is a real, resolvable fit before spending a full pitch on them. Skipping research makes this genuinely riskier. */
export function qualifyProspect(company: Company, prospectId: string, rng: RngState): QualifyResult {
  const prospect = company.prospects.find((p) => p.id === prospectId);
  if (!prospect) return { ok: false, qualified: false, reason: "Unknown prospect." };
  if (prospect.status !== "interested") return { ok: false, qualified: false, reason: "This prospect isn't ready to be qualified yet." };
  const successChance = prospect.researched ? 0.88 : 0.55;
  const qualified = chance(rng, successChance);
  if (qualified) {
    prospect.status = "qualified";
    return { ok: true, qualified: true, reason: `${prospect.name} confirmed real budget and need — ready for a proposal.` };
  }
  prospect.status = "lost";
  prospect.lostReason = prospect.researched
    ? "Turned out not to be a real fit after a deeper conversation."
    : "Turned out not to be a real fit — researching first would have caught this earlier.";
  return { ok: true, qualified: false, reason: prospect.lostReason };
}

/**
 * Pitches a prospect with real, player-chosen terms. The outcome is computed from how the offer
 * actually compares to the prospect's hidden willingness-to-pay/price sensitivity/quality bar, the
 * company's sales capability, and simple competitive/market noise — never a coin flip divorced from
 * the offer made. A near-miss pitch (all terms reasonably close but not quite enough) reveals a real
 * counter-offer instead of just losing outright.
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
  if (prospect.status !== "qualified" && prospect.status !== "negotiation") {
    return { ok: false, won: false, reason: "This prospect needs to be contacted and qualified before a formal pitch.", entries: [] };
  }

  prospect.contactAttempts += 1;
  prospect.lastContactWeek = week;

  const entries = [
    makeEntry({ week, date, memo: `Sales proposal — ${prospect.name}`, source: "sales-outreach", lines: [dr("marketing-expense", 40), cr("cash", 40)], cashFlowCategory: "operating" }),
  ];

  const priceRatio = pitch.priceOffered / Math.max(0.5, prospect.trueWillingnessToPayPerUnit);
  const priceFit = Math.max(0, 1 - Math.max(0, priceRatio - 1) * (0.6 + prospect.truePriceSensitivity));
  const volumeFit = Math.min(1, pitch.volumeCommitmentUnits / Math.max(1, prospect.trueAnnualVolumeUnits * 0.4));
  const termsFit = pitch.paymentTermsDaysOffered >= prospect.truePaymentTermsDays ? 1 : 0.25;
  const qualityFit = Math.max(0.2, Math.min(1.15, productQualityFactor / Math.max(0.2, prospect.trueQualityExpectation)));
  const switchingFriction = prospect.hasCurrentSupplier ? 0.05 : 0;
  // A track record of happy customers makes the next pitch easier; a poor one makes it harder — a
  // real, bounded nudge (+/-3pp at the reputation extremes), never the dominant factor in the math.
  const reputationFactor = (company.reputation - 50) / 1000;

  const baseCloseProbability =
    0.04 +
    priceFit * 0.5 +
    volumeFit * 0.08 +
    termsFit * 0.06 +
    Math.min(1, qualityFit) * 0.1 +
    Math.max(0, salesSkillFactor - 0.5) * 0.22 -
    switchingFriction +
    reputationFactor;

  const attemptFatigue = Math.max(0, (prospect.contactAttempts - 1) * 0.04); // repeated identical pitches don't help much
  const closeProbability = Math.max(0.02, Math.min(0.92, baseCloseProbability - attemptFatigue));

  const won = chance(rng, closeProbability);

  if (won) {
    prospect.status = "won";
    const contractLengthWeeks = Math.max(4, pitch.contractLengthWeeks);
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
      contractLengthWeeks,
      contractEndWeek: week + contractLengthWeeks,
      lastOrderWeek: null,
      atRisk: false,
      paymentReliability: round2(Math.max(40, Math.min(96, 100 - prospect.truePriceSensitivity * 40 + nextRange(rng, -8, 8)))),
      ordersFulfilled: 0,
      ordersMissed: 0,
      complaints: 0,
    };
    const isFirstCustomer = company.customers.length === 0;
    company.customers.push(customer);
    prospect.wonCustomerId = customer.id;
    company.historyLog.push({
      week,
      date,
      headline: `Won ${prospect.name} as a customer`,
      detail: `Signed at $${pitch.priceOffered.toFixed(2)}/unit, ~${pitch.volumeCommitmentUnits.toLocaleString()} units/yr committed, ${pitch.paymentTermsDaysOffered}-day terms, ${contractLengthWeeks}-week contract.`,
      category: "market",
    });
    if (isFirstCustomer) recordMilestoneOnce(company, week, date, "First customer signed", `${customer.name} became the company's first contracted customer.`);
    company.reputation = Math.min(100, Math.round(company.reputation + 2));
    return { ok: true, won: true, reason: "Closed the deal.", entries };
  }

  // A genuine near-miss: every lever was in a reasonable range, just not quite enough to close blind.
  // Reveal what it would actually take, rather than making the player guess forever.
  const isNegotiable = priceFit > 0.5 && volumeFit > 0.5 && termsFit > 0.5 && qualityFit > 0.5 && prospect.contactAttempts < 4;
  if (isNegotiable) {
    prospect.status = "negotiation";
    const counterOffer = {
      priceAcceptable: round2(prospect.trueWillingnessToPayPerUnit * 1.03),
      volumeAcceptable: Math.round(prospect.trueAnnualVolumeUnits * 0.55),
      paymentTermsAcceptable: prospect.truePaymentTermsDays,
    };
    const reason = "Close, but not quite there — they've indicated what it would actually take to sign.";
    prospect.lostReason = reason;
    company.historyLog.push({ week, date, headline: `${prospect.name} is negotiating`, detail: reason, category: "market" });
    return { ok: true, won: false, reason, entries, counterOffer };
  }

  let reason: string;
  if (priceFit < 0.4) reason = "Price came in too high relative to what they were willing to pay.";
  else if (qualityFit < 0.6) reason = "They weren't convinced the product met their quality bar.";
  else if (volumeFit < 0.3) reason = "The volume commitment didn't match what they were looking to buy.";
  else reason = "They passed for now — sometimes a well-matched pitch still doesn't land.";
  prospect.lostReason = reason;
  if (prospect.contactAttempts >= 4) prospect.status = "lost";
  else prospect.status = "qualified";
  company.historyLog.push({ week, date, headline: `Lost the pitch to ${prospect.name}`, detail: reason, category: "market" });
  return { ok: true, won: false, reason, entries };
}

/** Accepts the prospect's own revealed counter-offer outright — a guaranteed close at those exact terms, once a pitch has actually made it negotiable. Bypasses the probability model entirely: they already told you what they'd accept. */
export function acceptProspectCounterOffer(
  company: Company,
  prospectId: string,
  productId: string,
  week: number,
  date: string,
): PitchResult {
  const prospect = company.prospects.find((p) => p.id === prospectId);
  const product = company.products.find((p) => p.id === productId);
  if (!prospect) return { ok: false, won: false, reason: "Unknown prospect.", entries: [] };
  if (!product) return { ok: false, won: false, reason: "Unknown product.", entries: [] };
  if (prospect.status !== "negotiation") return { ok: false, won: false, reason: "There's no open counter-offer to accept.", entries: [] };

  const priceOffered = round2(prospect.trueWillingnessToPayPerUnit * 1.03);
  const volumeCommitmentUnits = Math.round(prospect.trueAnnualVolumeUnits * 0.55);
  const paymentTermsDaysOffered = prospect.truePaymentTermsDays;
  const contractLengthWeeks = 26;

  const entries = [
    makeEntry({ week, date, memo: `Contract signed — ${prospect.name}`, source: "sales-outreach", lines: [dr("marketing-expense", 20), cr("cash", 20)], cashFlowCategory: "operating" }),
  ];

  prospect.status = "won";
  const customer: CustomerAccount = {
    id: `cust-${week}-${Math.round(Math.random() * 1e6)}`,
    name: prospect.name,
    productId,
    segment: prospect.segment,
    location: prospect.location,
    locationId: prospect.locationId,
    annualVolumeUnits: volumeCommitmentUnits,
    priceSensitivity: prospect.truePriceSensitivity,
    qualityExpectation: prospect.trueQualityExpectation,
    paymentTermsDays: paymentTermsDaysOffered,
    relationshipStrength: 55,
    contractedSince: week,
    contractLengthWeeks,
    contractEndWeek: week + contractLengthWeeks,
    lastOrderWeek: null,
    atRisk: false,
    paymentReliability: round2(Math.max(40, Math.min(96, 100 - prospect.truePriceSensitivity * 40))),
    ordersFulfilled: 0,
    ordersMissed: 0,
    complaints: 0,
  };
  const isFirstCustomer = company.customers.length === 0;
  company.customers.push(customer);
  prospect.wonCustomerId = customer.id;
  company.historyLog.push({
    week,
    date,
    headline: `Won ${prospect.name} as a customer`,
    detail: `Accepted their counter: $${priceOffered.toFixed(2)}/unit, ~${volumeCommitmentUnits.toLocaleString()} units/yr, ${paymentTermsDaysOffered}-day terms, ${contractLengthWeeks}-week contract.`,
    category: "market",
  });
  if (isFirstCustomer) recordMilestoneOnce(company, week, date, "First customer signed", `${customer.name} became the company's first contracted customer.`);
  company.reputation = Math.min(100, Math.round(company.reputation + 2));
  return { ok: true, won: true, reason: "Accepted their counter-offer.", entries };
}
