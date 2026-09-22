import type { Company, Facility, FacilityOwnershipType } from "../types/core";
import type { IndustryDefinition } from "../types/industry";
import type { JournalEntry } from "../types/finance";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { makeLoan } from "./loans";
import { LOCATIONS_BY_ID } from "../data/locations";

export interface OpenFacilityResult {
  ok: boolean;
  entries: JournalEntry[];
  facility?: Facility;
  reason?: string;
}

export type FacilityFinancing = "cash" | "loan";

const PURCHASE_LOAN_RATE = 0.078;
const PURCHASE_LOAN_TERM_WEEKS = 260; // 5 years
const CONSTRUCTION_LOAN_RATE = 0.082;
const CONSTRUCTION_LOAN_TERM_WEEKS = 520; // 10 years

/** What it costs up front to open a facility this way, before financing — used to preview the decision to the player. */
export function estimateFacilityCost(
  purchaseValue: number,
  weeklyLeaseCost: number,
  ownershipType: FacilityOwnershipType,
): number {
  if (ownershipType === "lease") return round2(weeklyLeaseCost * 4);
  return purchaseValue;
}

/**
 * Opens a new facility at a chosen location, scaling the template's lease/utility/purchase costs by
 * that location's rent index so geography has a real, ongoing cost consequence. Supports three real
 * ownership paths (lease/purchase/construction) and two financing paths (cash/loan) that both flow
 * through the actual ledger — a purchase or construction draw either pays cash or issues a real,
 * amortizing note payable, never a fake balance-sheet adjustment.
 */
export function openFacilityForCompany(
  company: Company,
  industry: IndustryDefinition,
  facilityTemplateId: string,
  locationId: string,
  week: number,
  date: string,
  ownershipType: FacilityOwnershipType = "lease",
  financing: FacilityFinancing = "cash",
): OpenFacilityResult {
  const template = industry.facilityTemplates.find((t) => t.id === facilityTemplateId);
  if (!template) return { ok: false, entries: [], reason: "Unknown facility type." };
  const location = LOCATIONS_BY_ID[locationId];
  if (!location) return { ok: false, entries: [], reason: "Unknown location." };

  const rentIndex = location.commercialRentIndex;
  const weeklyLeaseCost = round2(template.weeklyLeaseCost * rentIndex);
  const weeklyUtilityBaseCost = round2(template.weeklyUtilityBaseCost * rentIndex);
  const purchaseValue = round2(template.purchaseValue * rentIndex);

  const entries: JournalEntry[] = [];
  const facilityId = `facility-${week}-${Math.round(Math.random() * 1e6)}`;
  const facilityName = `${template.name} — ${location.city}`;

  if (ownershipType === "lease") {
    const deposit = round2(weeklyLeaseCost * 4);
    if (deposit > 0) {
      entries.push(
        makeEntry({
          week,
          date,
          memo: `Lease security deposit — ${facilityName}`,
          source: "facility-opening",
          lines: [dr("prepaid-expenses", deposit), cr("cash", deposit)],
          cashFlowCategory: "investing",
        }),
      );
    }
  } else {
    const capitalAccount = ownershipType === "construction" ? "construction-in-progress" : "ppe";
    if (financing === "loan") {
      const loanId = `facility-loan-${facilityId}`;
      const loan = makeLoan({
        id: loanId,
        lender: `${location.city} Regional Bank`,
        principal: purchaseValue,
        annualRate: ownershipType === "construction" ? CONSTRUCTION_LOAN_RATE : PURCHASE_LOAN_RATE,
        termWeeks: ownershipType === "construction" ? CONSTRUCTION_LOAN_TERM_WEEKS : PURCHASE_LOAN_TERM_WEEKS,
        startWeek: week,
      });
      company.loans.push(loan);
      entries.push(
        makeEntry({
          week,
          date,
          memo: `${ownershipType === "construction" ? "Construction loan draw" : "Facility purchase loan"} — ${facilityName}`,
          source: "facility-financing",
          lines: [dr(capitalAccount, purchaseValue), cr("notes-payable", purchaseValue)],
          cashFlowCategory: "financing",
        }),
      );
    } else {
      entries.push(
        makeEntry({
          week,
          date,
          memo: `${ownershipType === "construction" ? "Construction paid in cash" : "Facility purchased in cash"} — ${facilityName}`,
          source: "facility-financing",
          lines: [dr(capitalAccount, purchaseValue), cr("cash", purchaseValue)],
          cashFlowCategory: "investing",
        }),
      );
    }
  }

  const underConstruction = ownershipType === "construction";
  const facility: Facility = {
    id: facilityId,
    name: facilityName,
    type: template.type,
    role: template.role,
    locationId,
    baseWeeklyCapacityUnits: template.baseWeeklyCapacityUnits,
    storageCapacityUnits: template.storageCapacityUnits,
    equipmentLevel: template.equipmentLevel,
    condition: 100,
    weeklyLeaseCost,
    weeklyUtilityBaseCost,
    ownedOutright: ownershipType !== "lease",
    ownershipType,
    purchaseValue,
    status: underConstruction ? "under-construction" : "operating",
    constructionCompleteWeek: underConstruction ? week + template.constructionWeeks : null,
    openedWeek: week,
  };

  company.facilities.push(facility);
  company.historyLog.push({
    week,
    date,
    headline: underConstruction
      ? `Broke ground on a new facility: ${facility.name}`
      : `Opened a new facility: ${facility.name}`,
    detail: underConstruction
      ? `${template.name} under construction in ${location.city}, ${location.state} — expected to open in week ${facility.constructionCompleteWeek}, adding ${template.baseWeeklyCapacityUnits.toLocaleString()} units/wk of capacity.`
      : `${template.name} in ${location.city}, ${location.state} — ${template.baseWeeklyCapacityUnits.toLocaleString()} units/wk of additional capacity. Local rent index ${(rentIndex * 100).toFixed(0)}% of national average.`,
    category: "expansion",
  });

  return { ok: true, entries, facility };
}

/** Weekly check: converts any facility whose construction just finished into an operating asset. */
export function processFacilityConstruction(company: Company, week: number, date: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const facility of company.facilities) {
    if (facility.status !== "under-construction") continue;
    if (facility.constructionCompleteWeek === null || week < facility.constructionCompleteWeek) continue;
    facility.status = "operating";
    facility.constructionCompleteWeek = null;
    if (facility.purchaseValue > 0) {
      entries.push(
        makeEntry({
          week,
          date,
          memo: `Construction complete — ${facility.name} placed in service`,
          source: "facility-financing",
          lines: [dr("ppe", facility.purchaseValue), cr("construction-in-progress", facility.purchaseValue)],
          cashFlowCategory: "noncash",
        }),
      );
    }
    company.historyLog.push({
      week,
      date,
      headline: `${facility.name} construction complete — now operating`,
      category: "expansion",
    });
  }
  return entries;
}
