export type CompetitorStrategy =
  | "cost-leader"
  | "premium-differentiator"
  | "aggressive-growth"
  | "defend-regional"
  | "cash-conservative";

export interface CompetitorHistoryNote {
  week: number;
  note: string;
}

export interface CompetitorCompany {
  id: string;
  name: string;
  industryId: string;
  locationId: string;
  strategy: CompetitorStrategy;
  cash: number;
  debt: number;
  price: number;
  capacityUnits: number;
  employeeCount: number;
  weeklyRevenue: number;
  weeklyNetIncome: number;
  /** True internal market share (0-1). The player only ever sees a noisy estimate of this. */
  marketShareEstimate: number;
  aggressiveness: number; // 0-1, how readily it reacts to player/market moves
  financialHealth: number; // 0-100 composite, drives failure risk
  founded: number;
  history: CompetitorHistoryNote[];
}
