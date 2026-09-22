import type { JournalEntry, Loan } from "./finance";
import type { Employee, FounderAllocation, JobOpening } from "./employee";
import type { RngState } from "../engine/rng";

export type Difficulty = "easy" | "realistic";

export type CompanyStage =
  | "founder" // just you
  | "small-business" // first few hires
  | "growing-company" // functional managers appear
  | "established-company" // multiple facilities/markets
  | "large-company" // executive management
  | "corporation"; // divisions, acquisitions, international

export type FacilityOwnershipType = "lease" | "purchase" | "construction";
export type FacilityStatus = "operating" | "under-construction" | "closed";
/** Generic role so non-production facilities (distribution centers, offices) share the same model without being forced into a factory shape. */
export type FacilityRole = "production" | "distribution" | "office";

export interface Facility {
  id: string;
  name: string;
  type: string; // industry-specific, e.g. "job-shop", "mill", "distribution-center"
  role: FacilityRole;
  locationId: string;
  baseWeeklyCapacityUnits: number;
  /** How many finished-goods units can physically sit here. Bounds internal transfers in; does not gate sales. */
  storageCapacityUnits: number;
  equipmentLevel: number; // 1 = manual/basic, higher = more automated/capacity
  condition: number; // 0-100, degrades with use, restored by maintenance
  weeklyLeaseCost: number;
  weeklyUtilityBaseCost: number;
  ownedOutright: boolean;
  ownershipType: FacilityOwnershipType;
  purchaseValue: number;
  status: FacilityStatus;
  /** Set when status is "under-construction"; the facility comes online this week. */
  constructionCompleteWeek: number | null;
  openedWeek: number;
}

export interface ProductLine {
  id: string;
  templateId: string;
  name: string;
  sku: string;
  unitLabel: string;
  priceWeekly: number; // current player-set price per unit
  /** This product's own estimated fair market price, used as the relative-price baseline for demand. The founding product's tracks the shared competitor-driven market index; others drift independently. */
  referenceMarketPrice: number;
  inputUnitsPerProductUnit: number; // raw-material units consumed per unit produced
  /** Share (0-1) of the facility's total machine+labor capacity devoted to this product this week. Sum across active products should stay <= 1. */
  capacityAllocationPct: number;
  inventoryUnits: number;
  /** Weighted-average finished-goods cost pools, split by cost type for COGS drill-down at sale. */
  fgValueMaterials: number;
  fgValueLabor: number;
  fgValueOverhead: number;
  unitsProducedLastWeek: number;
  unitsSoldLastWeek: number;
  unitsUnfulfilledLastWeek: number;
  /** false = discontinued: no longer produced, but remaining inventory can still be sold off. */
  active: boolean;
  discontinuedWeek?: number;
  /** Physical location of on-hand inventory, keyed by facility id. Sum should equal inventoryUnits. Used for facility-level reporting and internal transfers; sales draw from the pooled total. */
  facilityInventory: Record<string, number>;
}

export interface CustomerAccount {
  id: string;
  name: string;
  /** The product line this account buys. */
  productId: string;
  segment: string;
  location: string;
  /** Which geographic market (see data/locations.ts) this account is based in. Demand only materializes while the company has an active presence in this market. */
  locationId: string;
  annualVolumeUnits: number; // typical annual order volume at full satisfaction
  priceSensitivity: number; // 0-1, higher = more price sensitive
  qualityExpectation: number; // 0-1
  paymentTermsDays: number;
  relationshipStrength: number; // 0-100, affects retention & negotiation
  contractedSince: number; // week
  lastOrderWeek: number | null;
  atRisk: boolean;
}

export interface SupplierRelationship {
  id: string;
  name: string;
  inputId: string;
  location: string;
  pricePerUnit: number;
  quality: number; // 0-1
  reliability: number; // 0-1, affects delivery delay/shortfall risk
  paymentTermsDays: number;
  leadTimeWeeks: number;
  /** Share (0-1) of raw-material purchases sourced from this supplier. Sum across suppliers should stay at 1. */
  purchaseAllocationPct: number;
  /** Derived/display convenience: the supplier with the largest allocation. Not used in purchasing logic. */
  isPrimary: boolean;
}

export interface WeeklyKpiSnapshot {
  week: number;
  revenue: number;
  netIncome: number;
  cash: number;
  employeeCount: number;
  customerCount: number;
  unitsSold: number;
  unitsProduced: number;
  marketShareEstimate: number | null;
  avgPrice: number;
}

export interface HistoryEvent {
  week: number;
  date: string;
  headline: string;
  detail?: string;
  category: "founding" | "hiring" | "expansion" | "finance" | "market" | "event" | "milestone";
}

export interface CausalDriver {
  label: string;
  amount: number;
}

export interface CausalBreakdown {
  metric: "revenue" | "profit";
  totalChange: number;
  drivers: CausalDriver[];
}

export interface ManagementSnapshot {
  week: number;
  managementLoad: number;
  managementCapacity: number;
  founderEffectiveness: number; // 0-1, multiplies every founder-driven contribution this week
  managerCount: number;
}

/**
 * player-approval: nothing happens automatically, exactly like a company with no delegation.
 * threshold: the manager acts on their own up to thresholdAmount of exposure; bigger decisions queue for approval.
 * full-authority: the manager always acts on their own.
 */
export type AuthorityLevel = "player-approval" | "threshold" | "full-authority";

export interface DelegationDomainSettings {
  authority: AuthorityLevel;
  /** Purchasing: max $ shift in weekly purchasing exposure a manager may reallocate unprompted. Hiring: max annual salary a manager may offer unprompted. */
  thresholdAmount: number;
}

export interface DelegationSettings {
  purchasing: DelegationDomainSettings;
  hiring: DelegationDomainSettings;
}

export type ManagerDecisionDomain = "purchasing" | "hiring";
export type ManagerDecisionStatus = "auto-approved" | "pending-approval" | "player-approved" | "player-rejected";

export interface ManagerDecisionLogEntry {
  id: string;
  week: number;
  date: string;
  managerId: string;
  managerName: string;
  domain: ManagerDecisionDomain;
  headline: string;
  reasoning: string[];
  amountInvolved: number;
  status: ManagerDecisionStatus;
  /** Domain-specific payload needed to apply the decision later if it's approved after the fact. */
  proposal?: { supplierAllocations?: Record<string, number>; openingId?: string; candidateId?: string; salaryWeekly?: number; facilityId?: string };
}

/**
 * remote: sell into the region from existing facilities, no local presence. Cheapest, instant, worst freight economics.
 * distributor: a local distributor resells for you. Moderate cost, a few weeks to line up, gives up margin instead of paying freight.
 * warehouse: a local distribution-center facility you stock via internal transfers. Real capital, real transit time, near-local delivery once stocked.
 * facility: a full local production facility (lease/purchase/construction). Highest capital and longest lead time, but local production removes freight/regional risk entirely.
 */
export type MarketEntryMode = "remote" | "distributor" | "warehouse" | "facility";
export type MarketEntryStatus = "entering" | "active" | "exited";

export interface ExpansionForecast {
  estimatedMarketSizeLow: number;
  estimatedMarketSizeHigh: number;
  expectedFirstYearRevenueLow: number;
  expectedFirstYearRevenueHigh: number;
  expectedOperatingMarginLow: number;
  expectedOperatingMarginHigh: number;
  requiredInvestmentLow: number;
  requiredInvestmentHigh: number;
  estimatedBreakEvenYearsLow: number;
  estimatedBreakEvenYearsHigh: number;
  risks: string[];
}

export interface MarketEntry {
  id: string;
  locationId: string;
  productId: string;
  mode: MarketEntryMode;
  status: MarketEntryStatus;
  enteredWeek: number;
  enteredDate: string;
  /** The week this entry starts generating sales — remote is immediate, a facility can be months out. */
  activeFromWeek: number;
  investment: number;
  facilityId?: string;
  forecast: ExpansionForecast;
  /** Running actuals since entry, for forecast-vs-actual reporting. */
  actualRevenueToDate: number;
  actualWeeksActive: number;
  exitedWeek?: number;
}

export interface InTransitShipment {
  id: string;
  productId: string;
  fromFacilityId: string;
  toFacilityId: string;
  quantity: number;
  freightCost: number;
  shipWeek: number;
  arrivalWeek: number;
}

export type DecisionKind =
  | "review-candidate"
  | "review-evaluation"
  | "loan-payment-due"
  | "event-choice"
  | "restock-needed"
  | "price-stale"
  | "capacity-constrained"
  | "cash-warning"
  | "facility-maintenance"
  | "management-overload"
  | "manager-decision-pending"
  | "market-entry-ready"
  | "warehouse-restock-needed";

export interface PendingDecision {
  id: string;
  kind: DecisionKind;
  week: number;
  title: string;
  detail: string;
  severity: "info" | "opportunity" | "warning" | "urgent";
  relatedId?: string;
}

export interface Ownership {
  founderEquityPct: number;
  stakeholders: { name: string; type: string; equityPct: number; note?: string }[];
}

export interface Company {
  id: string;
  name: string;
  industryId: string;
  locationId: string;
  foundedWeek: number;
  foundedDate: string;
  stage: CompanyStage;
  entries: JournalEntry[];
  loans: Loan[];
  facilities: Facility[];
  products: ProductLine[];
  /** Units (e.g. pulp-tons) of the industry's primary raw material currently on hand. Dollar value lives in the GL raw-materials account. */
  rawMaterialInventoryUnits: number;
  employees: Employee[];
  openPositions: JobOpening[];
  customers: CustomerAccount[];
  suppliers: SupplierRelationship[];
  founderAllocation: FounderAllocation;
  kpiHistory: WeeklyKpiSnapshot[];
  historyLog: HistoryEvent[];
  ownership: Ownership;
  targetCustomerSegment: string;
  delegation: DelegationSettings;
  managerDecisionLog: ManagerDecisionLogEntry[];
  enteredMarkets: MarketEntry[];
  inTransitShipments: InTransitShipment[];
}

export interface EconomyState {
  interestRateAnnual: number;
  inflationAnnual: number;
  demandIndex: number; // 1.0 = normal; macro multiplier applied across industries
  cyclePhase: "expansion" | "peak" | "contraction" | "trough";
  weeksInPhase: number;
}

export interface GameMeta {
  saveId: string;
  saveName: string;
  difficulty: Difficulty;
  createdAt: string;
  lastPlayedAt: string;
}

export interface WeeklyBriefing {
  week: number;
  headline: string;
  paragraphs: string[];
}

export interface GameState {
  meta: GameMeta;
  week: number;
  currentDate: string;
  rng: RngState;
  company: Company;
  economy: EconomyState;
  competitors: import("./competitor").CompetitorCompany[];
  market: import("./industry").MarketState;
  pendingDecisions: PendingDecision[];
  lastBriefing: WeeklyBriefing | null;
  lastRevenueCausal: CausalBreakdown | null;
  lastProfitCausal: CausalBreakdown | null;
  lastEvaluations: import("./employee").WeeklyEvaluation[];
  recentEventLog: string[];
  lastManagementSnapshot: ManagementSnapshot | null;
}
