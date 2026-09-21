import type { CustomerSegmentTemplate } from "../../types/industry";

export const PAPER_CUSTOMER_SEGMENTS: CustomerSegmentTemplate[] = [
  {
    id: "regional-distributors",
    name: "Regional Paper Distributors",
    description: "Wholesale distributors buying in bulk to resell to office-supply retailers and print shops. Price-driven, contract-oriented, slow to switch suppliers once qualified.",
    typicalAnnualVolumeUnits: [2_000, 8_000],
    priceSensitivity: 0.7,
    qualityExpectation: 0.55,
    paymentTermsDays: 40,
  },
  {
    id: "print-shops-direct",
    name: "Independent Print Shops",
    description: "Smaller direct accounts buying regularly in modest volume. More relationship-driven, will pay a modest premium for reliability.",
    typicalAnnualVolumeUnits: [200, 900],
    priceSensitivity: 0.45,
    qualityExpectation: 0.65,
    paymentTermsDays: 21,
  },
  {
    id: "packaging-converters",
    name: "Packaging Converters",
    description: "Buyers of kraft/packaging stock for further converting into boxes and containers. Volume-driven, moderately price-sensitive.",
    typicalAnnualVolumeUnits: [1_500, 6_000],
    priceSensitivity: 0.6,
    qualityExpectation: 0.5,
    paymentTermsDays: 35,
  },
  {
    id: "specialty-print-houses",
    name: "Specialty Print Houses",
    description: "Buyers of premium/specialty stock for high-end print jobs. Low volume, high quality expectations, low price sensitivity if quality holds.",
    typicalAnnualVolumeUnits: [80, 450],
    priceSensitivity: 0.25,
    qualityExpectation: 0.85,
    paymentTermsDays: 21,
  },
];

export const PAPER_CUSTOMER_SEGMENTS_BY_ID: Record<string, CustomerSegmentTemplate> = Object.fromEntries(
  PAPER_CUSTOMER_SEGMENTS.map((c) => [c.id, c]),
);
