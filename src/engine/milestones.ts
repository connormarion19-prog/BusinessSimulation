import type { Company } from "../types/core";

/** Records a milestone in company history exactly once, ever — checked by headline so re-checking a
 * condition that's already true (e.g. every week after the first profitable one) is a safe no-op. */
export function recordMilestoneOnce(company: Company, week: number, date: string, headline: string, detail?: string): void {
  if (company.historyLog.some((h) => h.headline === headline)) return;
  company.historyLog.push({ week, date, headline, detail, category: "milestone" });
}
