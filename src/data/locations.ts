export interface LocationOption {
  id: string;
  city: string;
  state: string;
  description: string;
  laborCostIndex: number; // 1.0 = national average weekly wage multiplier
  commercialRentIndex: number; // 1.0 = national average
  corporateTaxRatePct: number; // combined state+local approx, added to federal in engine
  industrialInfrastructure: number; // 0-1, affects logistics cost & facility options
  regionalDemandMultiplier: number; // local market size vs national average
  supplierProximityNote: string;
  /** Rough relative position (not real lat/long) used only to estimate freight distance between markets. */
  coordX: number;
  coordY: number;
}

export const LOCATIONS: LocationOption[] = [
  {
    id: "wi-greenbay",
    city: "Green Bay",
    state: "Wisconsin",
    description: "Heart of the US paper belt. Deep local labor pool, established pulp suppliers, competitive freight rail access. Competition for skilled mill labor is real.",
    laborCostIndex: 0.97,
    commercialRentIndex: 0.85,
    corporateTaxRatePct: 7.9,
    industrialInfrastructure: 0.95,
    regionalDemandMultiplier: 1.05,
    supplierProximityNote: "Multiple regional pulp mills within short haul distance — lower freight, faster resupply.",
    coordX: 52,
    coordY: 78,
  },
  {
    id: "ga-savannah",
    city: "Savannah",
    state: "Georgia",
    description: "Southern pulp & paper corridor with port access for export. Lower labor costs, hot/humid climate affects some equipment maintenance schedules.",
    laborCostIndex: 0.88,
    commercialRentIndex: 0.78,
    corporateTaxRatePct: 5.75,
    industrialInfrastructure: 0.88,
    regionalDemandMultiplier: 0.95,
    supplierProximityNote: "Southern pine pulp readily available; port access supports future export ambitions.",
    coordX: 68,
    coordY: 25,
  },
  {
    id: "oh-columbus",
    city: "Columbus",
    state: "Ohio",
    description: "Central logistics hub with strong highway access to Midwest and Northeast printing/converting customers. Higher rent, deep customer base nearby.",
    laborCostIndex: 1.02,
    commercialRentIndex: 1.05,
    corporateTaxRatePct: 0,
    industrialInfrastructure: 0.9,
    regionalDemandMultiplier: 1.15,
    supplierProximityNote: "Pulp must be freighted in from Wisconsin/Southern mills — moderate freight surcharge.",
    coordX: 62,
    coordY: 68,
  },
  {
    id: "pa-erie",
    city: "Erie",
    state: "Pennsylvania",
    description: "Legacy manufacturing town with available industrial real estate and an experienced but aging blue-collar workforce.",
    laborCostIndex: 0.93,
    commercialRentIndex: 0.7,
    corporateTaxRatePct: 8.99,
    industrialInfrastructure: 0.8,
    regionalDemandMultiplier: 0.9,
    supplierProximityNote: "Reasonable rail access to Northeast pulp suppliers; some routes are single-carrier.",
    coordX: 72,
    coordY: 80,
  },
  {
    id: "or-portland",
    city: "Portland",
    state: "Oregon",
    description: "Pacific Northwest timber region. Strong environmental regulation, higher labor and land costs, proximity to Asian export markets via the port.",
    laborCostIndex: 1.12,
    commercialRentIndex: 1.2,
    corporateTaxRatePct: 6.6,
    industrialInfrastructure: 0.85,
    regionalDemandMultiplier: 1.0,
    supplierProximityNote: "Excellent softwood pulp access; stricter environmental permitting can slow expansion.",
    coordX: 8,
    coordY: 88,
  },
  {
    id: "tx-tyler",
    city: "Tyler",
    state: "Texas",
    description: "East Texas timber country, no state corporate income tax, business-friendly permitting, growing regional demand.",
    laborCostIndex: 0.9,
    commercialRentIndex: 0.75,
    corporateTaxRatePct: 0,
    industrialInfrastructure: 0.78,
    regionalDemandMultiplier: 1.1,
    supplierProximityNote: "Regional pine pulp suppliers nearby, though fewer alternates if one fails.",
    coordX: 45,
    coordY: 22,
  },
];

export const LOCATIONS_BY_ID: Record<string, LocationOption> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
);

/** Rough relative distance between two markets, in "distance units" (not real miles) — used only for freight-cost estimation. */
export function locationDistance(aId: string, bId: string): number {
  if (aId === bId) return 0;
  const a = LOCATIONS_BY_ID[aId];
  const b = LOCATIONS_BY_ID[bId];
  if (!a || !b) return 50;
  return Math.sqrt((a.coordX - b.coordX) ** 2 + (a.coordY - b.coordY) ** 2);
}
