export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Debit-normal for asset/expense, credit-normal for liability/equity/revenue. */
  normalSide: "debit" | "credit";
}

export type CashFlowCategory = "operating" | "investing" | "financing" | "noncash";

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  week: number;
  date: string; // ISO date
  memo: string;
  source: string; // e.g. "payroll", "sale", "purchase", "loan-draw", "depreciation"
  lines: JournalLine[];
  cashFlowCategory?: CashFlowCategory;
  /** Optional reporting metadata — never affects balancing. Lets drill-down reports attribute an entry to the product it belongs to without parsing memo text. */
  productId?: string;
}

export interface Loan {
  id: string;
  lender: string;
  originalPrincipal: number;
  balance: number;
  annualRate: number;
  termWeeks: number;
  weeklyPayment: number;
  weeksRemaining: number;
  startWeek: number;
  originationFee?: number;
}

export interface IncomeStatement {
  periodLabel: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: Record<string, number>;
  totalOperatingExpenses: number;
  operatingIncome: number;
  interestExpense: number;
  incomeBeforeTax: number;
  taxExpense: number;
  netIncome: number;
}

export interface BalanceSheet {
  asOfWeek: number;
  assets: Record<string, number>;
  totalAssets: number;
  liabilities: Record<string, number>;
  totalLiabilities: number;
  equity: Record<string, number>;
  totalEquity: number;
  balances: boolean;
  imbalanceAmount: number;
}

export interface CashFlowStatement {
  periodLabel: string;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  beginningCash: number;
  endingCash: number;
}

export interface FinancialRatios {
  currentRatio: number | null;
  quickRatio: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  daysCashOnHand: number | null;
}
