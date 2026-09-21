import type { Company } from "../types/core";
import type { IndustryDefinition } from "../types/industry";
import type { RngState } from "./rng";
import { nextInt, nextRange } from "./rng";
import { round2 } from "./ledger";

/** Adds a new active product line, taking capacity share from existing active products. Returns false if the template is unknown or already active. */
export function addProductToCompany(
  company: Company,
  industry: IndustryDefinition,
  productTemplateId: string,
  week: number,
  date: string,
  rng: RngState,
): boolean {
  const template = industry.productTemplates.find((t) => t.id === productTemplateId);
  if (!template) return false;
  if (company.products.some((p) => p.templateId === productTemplateId && p.active)) return false;

  const newShare = 0.25;
  const activeProducts = company.products.filter((p) => p.active);
  for (const p of activeProducts) {
    p.capacityAllocationPct = round2(p.capacityAllocationPct * (1 - newShare));
  }

  company.products.push({
    id: `product-${week}-${Math.round(Math.random() * 1e6)}`,
    templateId: template.id,
    name: template.name,
    sku: `${template.id.toUpperCase().slice(0, 4)}-${nextInt(rng, 1000, 9999)}`,
    unitLabel: template.unitLabel,
    priceWeekly: template.suggestedUnitPrice,
    referenceMarketPrice: round2(template.suggestedUnitPrice * nextRange(rng, 0.95, 1.05)),
    inputUnitsPerProductUnit: template.inputUnitsPerProductUnit,
    capacityAllocationPct: newShare,
    inventoryUnits: 0,
    fgValueMaterials: 0,
    fgValueLabor: 0,
    fgValueOverhead: 0,
    unitsProducedLastWeek: 0,
    unitsSoldLastWeek: 0,
    unitsUnfulfilledLastWeek: 0,
    active: true,
  });
  company.historyLog.push({
    week,
    date,
    headline: `Launched a new product line: ${template.name}`,
    detail: `Allocated ${Math.round(newShare * 100)}% of facility capacity; other product lines were scaled back to make room.`,
    category: "expansion",
  });
  return true;
}

/** Discontinues an active product line (keeping it sellable while inventory remains). Returns false if it's the last active line or not found. */
export function discontinueProductOnCompany(company: Company, productId: string, week: number, date: string): boolean {
  const product = company.products.find((p) => p.id === productId);
  if (!product || !product.active) return false;
  if (company.products.filter((p) => p.active).length <= 1) return false;
  product.active = false;
  product.discontinuedWeek = week;
  product.capacityAllocationPct = 0;
  company.historyLog.push({
    week,
    date,
    headline: `Discontinued ${product.name}`,
    detail: product.inventoryUnits > 0.5
      ? `Remaining inventory (${Math.round(product.inventoryUnits)} ${product.unitLabel}s) will still be sold off.`
      : undefined,
    category: "expansion",
  });
  return true;
}
