import type { ProductTemplate } from "../../types/industry";

/**
 * Unit of sale is a "case" (10 reams / 5,000 sheets equivalent), whether the
 * underlying product is copy paper, packaging stock, or specialty stock.
 * inputUnitsPerProductUnit is in pulp-tons consumed per case.
 */
export const PAPER_PRODUCTS: ProductTemplate[] = [
  {
    id: "copy-paper",
    name: "Standard Copy Paper",
    description: "Commodity 20lb copy/printer paper sold by the case. High volume, thin margin, wins on reliability and price.",
    unitLabel: "case",
    baseUnitVariableCost: 14.5,
    suggestedUnitPrice: 19.25,
    inputUnitsPerProductUnit: 0.082,
  },
  {
    id: "packaging-paper",
    name: "Kraft Packaging Paper",
    description: "Heavier kraft stock sold to packaging converters by the case-equivalent roll. Bulkier, more freight-sensitive, moderate margin.",
    unitLabel: "roll",
    baseUnitVariableCost: 21.75,
    suggestedUnitPrice: 28.5,
    inputUnitsPerProductUnit: 0.121,
  },
  {
    id: "specialty-paper",
    name: "Specialty & Premium Stock",
    description: "Coated, colored, or heavyweight specialty paper for print houses. Lower volume, much higher margin, more exacting quality bar.",
    unitLabel: "case",
    baseUnitVariableCost: 34.0,
    suggestedUnitPrice: 51.0,
    inputUnitsPerProductUnit: 0.095,
  },
];

export const PAPER_PRODUCTS_BY_ID: Record<string, ProductTemplate> = Object.fromEntries(
  PAPER_PRODUCTS.map((p) => [p.id, p]),
);
