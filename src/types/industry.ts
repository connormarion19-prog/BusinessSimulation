import type { JournalEntry } from "./finance";
import type { Company, Difficulty, EconomyState, HistoryEvent } from "./core";
import type { EmployeeRoleTemplate } from "./employee";
import type { CompetitorCompany } from "./competitor";
import type { RngState } from "../engine/rng";

export interface IndustryMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  startingCapitalRange: [number, number];
  implemented: boolean;
}

/** One geographic market's own demand pool and price level. Keyed by location id in MarketState.regions. */
export interface RegionalMarketState {
  locationId: string;
  weeklyDemandUnits: number;
  estimatedDemandRangeUnits: [number, number];
  avgMarketPrice: number;
  /** 0-1 rough estimate of how contested this region is, from competitor presence there. Displayed to the player as an estimate, not exposed as ground truth. */
  competitivePressure: number;
}

export interface MarketState {
  /** National/home-region aggregate — still drives input pricing and the legacy single-market UI. */
  regionalWeeklyDemandUnits: number;
  estimatedDemandRangeUnits: [number, number];
  avgMarketPrice: number;
  inputPricePerUnit: number;
  inputPriceTrendPct: number;
  priceElasticity: number;
  unitLabel: string;
  inputLabel: string;
  /** Per-location demand pools for every market the company has actually entered (see Company.enteredMarkets). */
  regions: Record<string, RegionalMarketState>;
}

export interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  unitLabel: string;
  baseUnitVariableCost: number;
  suggestedUnitPrice: number;
  inputUnitsPerProductUnit: number; // raw material consumption per unit produced
  /** This product's share (0-1) of total regional demand within its industry's demand pool. */
  categoryDemandShare: number;
}

export interface FacilityTemplate {
  id: string;
  name: string;
  type: string;
  role: import("./core").FacilityRole;
  description: string;
  baseWeeklyCapacityUnits: number;
  storageCapacityUnits: number;
  equipmentLevel: number;
  weeklyLeaseCost: number;
  weeklyUtilityBaseCost: number;
  purchaseValue: number;
  minStartingCapitalRecommended: number;
  /** Weeks of build time when opened via ownershipType "construction". Lease/purchase of an existing building is immediate. */
  constructionWeeks: number;
}

export interface SupplierTemplate {
  id: string;
  name: string;
  inputId: string;
  location: string;
  pricePerUnit: number;
  quality: number;
  reliability: number;
  paymentTermsDays: number;
  leadTimeWeeks: number;
  minimumOrderUnits: number;
}

export interface CustomerSegmentTemplate {
  id: string;
  name: string;
  description: string;
  typicalAnnualVolumeUnits: [number, number];
  priceSensitivity: number;
  qualityExpectation: number;
  paymentTermsDays: number;
}

export interface NewCompanyParams {
  name: string;
  difficulty: Difficulty;
  locationId: string;
  financingSourceId: string;
  startingCash: number;
  loanTerms?: { principal: number; annualRate: number; termWeeks: number; lender: string };
  investorEquityPct?: number;
  targetCustomerSegmentId: string;
  productTemplateId: string;
  facilityTemplateId: string;
  foundedWeek: number;
  foundedDate: string;
}

export interface IndustrySimContext {
  company: Company;
  market: MarketState;
  economy: EconomyState;
  competitors: CompetitorCompany[];
  rng: RngState;
  week: number;
  date: string;
  difficulty: Difficulty;
  /** 0-1 multiplier on every founder-driven (undelegated) contribution this week, degraded by organizational complexity outrunning management capacity. */
  founderEffectiveness: number;
  /** Scratch space events use to signal same-week effects to production/sales logic. */
  eventFlags: Record<string, number>;
}

export interface IndustryWeekResult {
  entries: JournalEntry[];
  market: MarketState;
  narrativeNotes: string[];
  historyEvents: HistoryEvent[];
  evaluations: import("./employee").WeeklyEvaluation[];
}

export interface IndustryEventEffect {
  entries: JournalEntry[];
  narrative: string;
  historyEvent?: HistoryEvent;
}

export interface IndustryEventDefinition {
  id: string;
  title: string;
  category: string;
  severity: "positive" | "negative";
  baseWeeklyProbability: number;
  eligible(ctx: IndustrySimContext): boolean;
  apply(ctx: IndustrySimContext): IndustryEventEffect;
}

export interface IndustryDefinition extends IndustryMeta {
  employeeRoles: EmployeeRoleTemplate[];
  productTemplates: ProductTemplate[];
  facilityTemplates: FacilityTemplate[];
  supplierTemplates: SupplierTemplate[];
  customerSegments: CustomerSegmentTemplate[];
  financingNotes: string;
  eventPool: IndustryEventDefinition[];
  createInitialState(params: NewCompanyParams, rng: RngState): { company: Company; market: MarketState };
  simulateWeek(ctx: IndustrySimContext): IndustryWeekResult;
}
