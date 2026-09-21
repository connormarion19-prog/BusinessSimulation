import type { Company, Facility } from "../types/core";
import type { IndustryDefinition } from "../types/industry";
import type { JournalEntry } from "../types/finance";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { LOCATIONS_BY_ID } from "../data/locations";

export interface OpenFacilityResult {
  ok: boolean;
  entries: JournalEntry[];
  facility?: Facility;
  reason?: string;
}

/**
 * Opens a new facility at a chosen location, scaling the template's lease/utility/purchase
 * costs by that location's rent index so geography has a real, ongoing cost consequence
 * rather than being cosmetic. A security deposit (4 weeks of lease) is paid up front.
 */
export function openFacilityForCompany(
  company: Company,
  industry: IndustryDefinition,
  facilityTemplateId: string,
  locationId: string,
  week: number,
  date: string,
): OpenFacilityResult {
  const template = industry.facilityTemplates.find((t) => t.id === facilityTemplateId);
  if (!template) return { ok: false, entries: [], reason: "Unknown facility type." };
  const location = LOCATIONS_BY_ID[locationId];
  if (!location) return { ok: false, entries: [], reason: "Unknown location." };

  const rentIndex = location.commercialRentIndex;
  const weeklyLeaseCost = round2(template.weeklyLeaseCost * rentIndex);
  const weeklyUtilityBaseCost = round2(template.weeklyUtilityBaseCost * rentIndex);
  const purchaseValue = round2(template.purchaseValue * rentIndex);
  const deposit = round2(weeklyLeaseCost * 4);

  const facility: Facility = {
    id: `facility-${week}-${Math.round(Math.random() * 1e6)}`,
    name: `${template.name} — ${location.city}`,
    type: template.type,
    locationId,
    baseWeeklyCapacityUnits: template.baseWeeklyCapacityUnits,
    equipmentLevel: template.equipmentLevel,
    condition: 100,
    weeklyLeaseCost,
    weeklyUtilityBaseCost,
    ownedOutright: false,
    purchaseValue,
  };

  const entries: JournalEntry[] = [];
  if (deposit > 0) {
    entries.push(
      makeEntry({
        week,
        date,
        memo: `Lease security deposit — ${facility.name}`,
        source: "facility-opening",
        lines: [dr("prepaid-expenses", deposit), cr("cash", deposit)],
        cashFlowCategory: "investing",
      }),
    );
  }

  company.facilities.push(facility);
  company.historyLog.push({
    week,
    date,
    headline: `Opened a new facility: ${facility.name}`,
    detail: `${template.name} in ${location.city}, ${location.state} — ${template.baseWeeklyCapacityUnits.toLocaleString()} units/wk of additional capacity. Local rent index ${(rentIndex * 100).toFixed(0)}% of national average.`,
    category: "expansion",
  });

  return { ok: true, entries, facility };
}
