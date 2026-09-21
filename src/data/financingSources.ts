export interface FinancingSourceOption {
  id: string;
  name: string;
  description: string;
  capitalRange: [number, number];
  structure: "loan" | "equity" | "loan+equity" | "grant" | "cash";
  loanAnnualRate?: number;
  loanTermWeeks?: number;
  equityDilutionPct?: number;
  majorRisk: string;
  majorBenefit: string;
  controlImplication: string;
}

export const FINANCING_SOURCES: FinancingSourceOption[] = [
  {
    id: "personal-savings",
    name: "Personal Savings",
    description: "You fund the business entirely yourself. No debt, no investors, no outside opinions.",
    capitalRange: [15_000, 60_000],
    structure: "cash",
    majorRisk: "Your personal financial cushion is gone if the business struggles — no lender or investor shares the downside.",
    majorBenefit: "You keep 100% ownership and owe nothing to anyone. Every decision is yours alone.",
    controlImplication: "Full control. No covenants, no board, no repayment schedule.",
  },
  {
    id: "friends-family",
    name: "Family & Friends Loan",
    description: "An informal loan from people who know and trust you, usually below market rate.",
    capitalRange: [10_000, 50_000],
    structure: "loan",
    loanAnnualRate: 0.04,
    loanTermWeeks: 260,
    majorRisk: "A struggling business can damage real relationships, not just your credit score.",
    majorBenefit: "Below-market interest rate and a lender who is unlikely to call the loan early.",
    controlImplication: "Full operating control; informal social obligation to keep them informed.",
  },
  {
    id: "bank-loan",
    name: "Bank Term Loan",
    description: "A conventional small-business term loan from a local or regional bank, typically requiring a personal guarantee and collateral.",
    capitalRange: [75_000, 400_000],
    structure: "loan",
    loanAnnualRate: 0.084,
    loanTermWeeks: 364,
    majorRisk: "Fixed weekly repayment regardless of how the business performs; missed payments risk seized collateral.",
    majorBenefit: "Retain 100% ownership; interest is tax-deductible.",
    controlImplication: "Full operating control, but loan covenants may restrict additional borrowing without the bank's consent.",
  },
  {
    id: "sba-loan",
    name: "SBA-Backed Loan",
    description: "A government-guaranteed small-business loan with a longer term and lower down payment than a conventional bank loan.",
    capitalRange: [150_000, 750_000],
    structure: "loan",
    loanAnnualRate: 0.072,
    loanTermWeeks: 520,
    majorRisk: "Extensive documentation and a personal guarantee; slow approval process before you can start.",
    majorBenefit: "Lower rate and longer amortization than a conventional loan, easing early cash flow.",
    controlImplication: "Full operating control; SBA reporting requirements apply.",
  },
  {
    id: "angel-investor",
    name: "Angel Investor",
    description: "A wealthy individual investor provides capital in exchange for an equity stake and, often, informal advice.",
    capitalRange: [50_000, 300_000],
    structure: "equity",
    equityDilutionPct: 20,
    majorRisk: "You give up meaningful ownership and gain a stakeholder with opinions about how the business should run.",
    majorBenefit: "No repayment obligation — if the business struggles, you don't owe the cash back.",
    controlImplication: "You retain day-to-day control, but the investor expects updates and a path to a return.",
  },
  {
    id: "venture-capital",
    name: "Venture Capital",
    description: "An institutional VC fund invests a larger round in exchange for significant equity and board influence, expecting rapid growth.",
    capitalRange: [500_000, 3_000_000],
    structure: "equity",
    equityDilutionPct: 35,
    majorRisk: "Substantial dilution and pressure to grow aggressively; investors may push for an exit you don't want.",
    majorBenefit: "Large capital infusion enables much faster scaling than bootstrapping allows.",
    controlImplication: "A board seat and major-decision approval rights typically come with this size of round.",
  },
  {
    id: "business-partner",
    name: "Business Partner",
    description: "A co-founder contributes capital (and often labor) in exchange for a real ownership stake and a voice in decisions.",
    capitalRange: [30_000, 150_000],
    structure: "equity",
    equityDilutionPct: 40,
    majorRisk: "Shared control — major decisions may require agreement, and partnerships can sour under stress.",
    majorBenefit: "Shared financial risk and (often) complementary skills or connections.",
    controlImplication: "Significant decisions are effectively co-owned, not unilateral.",
  },
  {
    id: "sba-microloan",
    name: "SBA Microloan",
    description: "A small government-backed loan aimed at very early-stage businesses, often paired with free mentoring.",
    capitalRange: [10_000, 50_000],
    structure: "loan",
    loanAnnualRate: 0.075,
    loanTermWeeks: 260,
    majorRisk: "Capital amount is modest — likely insufficient alone for a capital-intensive facility.",
    majorBenefit: "Accessible even with thin credit history; often bundled with free small-business mentoring.",
    controlImplication: "Full operating control.",
  },
];

export const FINANCING_SOURCES_BY_ID: Record<string, FinancingSourceOption> = Object.fromEntries(
  FINANCING_SOURCES.map((f) => [f.id, f]),
);
