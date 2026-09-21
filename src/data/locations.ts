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
  },
];

export const LOCATIONS_BY_ID: Record<string, LocationOption> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
);
