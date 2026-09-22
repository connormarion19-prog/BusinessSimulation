import type { Company } from "../types/core";
import type { IndustryDefinition } from "../types/industry";
import { round2 } from "./ledger";

/** Adds a new supplier relationship, taking purchase allocation from existing suppliers. Returns false if the template is unknown or already in use. */
export function addSupplierToCompany(
  company: Company,
  industry: IndustryDefinition,
  supplierTemplateId: string,
  week: number,
  date: string,
): boolean {
  const template = industry.supplierTemplates.find((t) => t.id === supplierTemplateId);
  if (!template) return false;
  if (company.suppliers.some((s) => s.name === template.name)) return false;

  const isFirstSupplier = company.suppliers.length === 0;
  const newShare = isFirstSupplier ? 1 : 0.25;
  for (const s of company.suppliers) {
    s.purchaseAllocationPct = round2(s.purchaseAllocationPct * (1 - newShare));
  }
  company.suppliers.push({
    id: `supplier-${week}-${Math.round(Math.random() * 1e6)}`,
    name: template.name,
    inputId: template.inputId,
    location: template.location,
    pricePerUnit: template.pricePerUnit,
    quality: template.quality,
    reliability: template.reliability,
    paymentTermsDays: template.paymentTermsDays,
    leadTimeWeeks: template.leadTimeWeeks,
    purchaseAllocationPct: newShare,
    isPrimary: isFirstSupplier,
    minimumOrderUnits: template.minimumOrderUnits,
    negotiationRounds: 0,
    lastNegotiationWeek: null,
  });
  company.historyLog.push({
    week,
    date,
    headline: `Added ${template.name} as a supplier`,
    detail: isFirstSupplier
      ? "Your first raw-material source — production can now actually run."
      : `Sourcing ${Math.round(newShare * 100)}% of purchases from this supplier to diversify supply risk.`,
    category: "finance",
  });
  return true;
}

/** Removes a supplier relationship, redistributing its allocation among the remainder. Returns false if it's the last supplier or not found. */
export function removeSupplierFromCompany(company: Company, supplierId: string, week: number, date: string): boolean {
  if (company.suppliers.length <= 1) return false;
  const supplier = company.suppliers.find((s) => s.id === supplierId);
  if (!supplier) return false;
  const freedShare = supplier.purchaseAllocationPct;
  company.suppliers = company.suppliers.filter((s) => s.id !== supplierId);
  const remainingTotal = company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);
  if (remainingTotal > 0) {
    for (const s of company.suppliers) {
      s.purchaseAllocationPct = round2(s.purchaseAllocationPct + (s.purchaseAllocationPct / remainingTotal) * freedShare);
    }
  } else if (company.suppliers.length > 0) {
    company.suppliers[0].purchaseAllocationPct = 1;
  }
  company.historyLog.push({
    week,
    date,
    headline: `Dropped ${supplier.name} as a supplier`,
    category: "finance",
  });
  return true;
}
