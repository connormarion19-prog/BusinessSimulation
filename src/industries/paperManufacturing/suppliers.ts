import type { SupplierTemplate } from "../../types/industry";

export const PAPER_SUPPLIERS: SupplierTemplate[] = [
  {
    id: "regional-pulp-co",
    name: "Regional Pulp Co.",
    inputId: "wood-pulp",
    location: "Regional",
    pricePerUnit: 185,
    quality: 0.8,
    reliability: 0.9,
    paymentTermsDays: 30,
    leadTimeWeeks: 1,
  },
  {
    id: "discount-pulp-broker",
    name: "Continental Pulp Brokers",
    inputId: "wood-pulp",
    location: "National spot market",
    pricePerUnit: 158,
    quality: 0.62,
    reliability: 0.68,
    paymentTermsDays: 15,
    leadTimeWeeks: 2,
  },
  {
    id: "premium-northern-pulp",
    name: "Northern Fiber Partners",
    inputId: "wood-pulp",
    location: "Northern mills",
    pricePerUnit: 212,
    quality: 0.95,
    reliability: 0.95,
    paymentTermsDays: 45,
    leadTimeWeeks: 1,
  },
];

export const PAPER_SUPPLIERS_BY_ID: Record<string, SupplierTemplate> = Object.fromEntries(
  PAPER_SUPPLIERS.map((s) => [s.id, s]),
);
