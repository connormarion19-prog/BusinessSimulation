import type { CausalBreakdown, WeeklyBriefing } from "../types/core";
import type { IncomeStatement } from "../types/finance";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function buildWeeklyBriefing(params: {
  week: number;
  companyName: string;
  incomeStatement: IncomeStatement;
  cash: number;
  revenueCausal: CausalBreakdown | null;
  industryNotes: string[];
  competitorNotes: string[];
  eventNotes: string[];
}): WeeklyBriefing {
  const { week, incomeStatement, cash } = params;

  let headline: string;
  if (params.revenueCausal && Math.abs(params.revenueCausal.totalChange) > 1) {
    const direction = params.revenueCausal.totalChange > 0 ? "increased" : "decreased";
    const driver = [...params.revenueCausal.drivers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    headline = `Revenue ${direction} $${fmt(Math.abs(params.revenueCausal.totalChange))} this week, primarily from ${driver.label.toLowerCase()}.`;
  } else {
    headline = incomeStatement.netIncome >= 0
      ? `A steady week — net income of $${fmt(incomeStatement.netIncome)}.`
      : `A tough week — a net loss of $${fmt(Math.abs(incomeStatement.netIncome))}.`;
  }

  const paragraphs: string[] = [];
  if (params.industryNotes.length) paragraphs.push(params.industryNotes.join(" "));
  paragraphs.push(
    `Net income this week was $${fmt(incomeStatement.netIncome)} on revenue of $${fmt(incomeStatement.revenue)} ` +
      `(gross margin ${(incomeStatement.grossMargin * 100).toFixed(1)}%). Cash on hand stands at $${fmt(cash)}.`,
  );
  if (params.eventNotes.length) paragraphs.push(params.eventNotes.join(" "));
  if (params.competitorNotes.length) paragraphs.push(params.competitorNotes.join(" "));

  return { week, headline, paragraphs };
}
