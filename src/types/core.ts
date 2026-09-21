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

export interface Facility {
  id: string;
  name: string;
  type: string; // industry-specific, e.g. "job-shop", "mill"
  locationId: string;
  baseWeeklyCapacityUnits: number;
  equipmentLevel: number; // 1 = manual/basic, higher = more automated/capacity
  condition: number; // 0-100, degrades with use, restored by maintenance
  weeklyLeaseCost: number;
  weeklyUtilityBaseCost: number;
  ownedOutright: boolean;
  purchaseValue: number;
}

export interface ProductLine {
  id: string;
  templateId: string;
  name: string;
  sku: string;
  unitLabel: string;
  priceWeekly: number; // current player-set price per unit
  inputUnitsPerProductUnit: number; // raw-material units consumed per unit produced
  inventoryUnits: number;
  /** Weighted-average finished-goods cost pools, split by cost type for COGS drill-down at sale. */
  fgValueMaterials: number;
  fgValueLabor: number;
  fgValueOverhead: number;
  unitsProducedLastWeek: number;
  unitsSoldLastWeek: number;
  unitsUnfulfilledLastWeek: number;
  active: boolean;
}

export interface CustomerAccount {
  id: string;
  name: string;
  segment: string;
  location: string;
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

export type DecisionKind =
  | "review-candidate"
  | "review-evaluation"
  | "loan-payment-due"
  | "event-choice"
  | "restock-needed"
  | "price-stale"
  | "capacity-constrained"
  | "cash-warning"
  | "facility-maintenance";

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
}
