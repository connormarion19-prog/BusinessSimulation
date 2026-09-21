import type { Employee, WeeklyEvaluation } from "../types/employee";

export function classifyTone(performanceScore: number): WeeklyEvaluation["tone"] {
  if (performanceScore >= 75) return "strong";
  if (performanceScore >= 55) return "solid";
  if (performanceScore >= 35) return "mixed";
  return "concerning";
}

const CLOSING_LINES: Record<WeeklyEvaluation["tone"], string[]> = {
  strong: [
    "This was a standout week with minimal oversight required.",
    "Work this week was ahead of expectations across the board.",
  ],
  solid: [
    "Overall a solid, dependable week.",
    "Nothing alarming here — steady, reliable output.",
  ],
  mixed: [
    "A mixed week — some real positives alongside issues worth watching.",
    "Results were uneven; worth checking in before it becomes a pattern.",
  ],
  concerning: [
    "This week's results are a concern and probably warrant a direct conversation.",
    "Performance fell short this week in ways that need addressing.",
  ],
};

export function buildEvaluation(params: {
  employee: Employee;
  week: number;
  performanceScore: number;
  errors: number;
  metrics: Record<string, number>;
  highlights: string[];
  concerns: string[];
  managerNote?: string;
}): WeeklyEvaluation {
  const tone = classifyTone(params.performanceScore);
  const sentences = [...params.highlights, ...params.concerns];
  const closing = CLOSING_LINES[tone][params.week % CLOSING_LINES[tone].length];
  const narrative = [params.employee.name, "—", sentences.join(" "), closing].join(" ").replace(/\s+/g, " ").trim();

  return {
    week: params.week,
    employeeId: params.employee.id,
    narrative,
    tone,
    metrics: params.metrics,
    errors: params.errors,
    managerNote: params.managerNote,
  };
}
