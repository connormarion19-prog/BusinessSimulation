import type { Department, Employee, EmployeeTraits, WorkFunction } from "../types/employee";
import type { RngState } from "./rng";
import { nextNormal } from "./rng";

export const RELEVANT_TRAITS: Record<Department, (keyof EmployeeTraits)[]> = {
  production: ["technicalAbility", "reliability", "adaptability"],
  purchasing: ["judgment", "organization", "communication"],
  sales: ["communication", "initiative", "adaptability"],
  accounting: ["attentionToDetail", "organization", "reliability"],
  management: ["leadership", "judgment", "communication"],
  quality: ["attentionToDetail", "technicalAbility", "judgment"],
  maintenance: ["technicalAbility", "reliability", "initiative"],
  administration: ["organization", "communication", "reliability"],
};

/** Same idea as RELEVANT_TRAITS but keyed by the five weekly-capacity functions (see WorkFunction), not org-chart department. */
export const WORK_FUNCTION_TRAITS: Record<WorkFunction, (keyof EmployeeTraits)[]> = {
  accounting: ["attentionToDetail", "organization", "reliability"],
  purchasing: ["judgment", "organization", "communication"],
  sales: ["communication", "initiative", "adaptability"],
  operations: ["technicalAbility", "reliability", "adaptability"],
  administration: ["organization", "communication", "reliability"],
};

export const WORK_FUNCTIONS: WorkFunction[] = ["accounting", "purchasing", "sales", "operations", "administration"];

/** This employee's trait-derived skill (0-100ish) in one specific function, scaled by their role's affinity for it — a specialist's off-domain affinity is low even if the raw traits are decent. */
export function computeFunctionSkill(employee: Employee, fn: WorkFunction, roleAffinity: number): number {
  const traits = WORK_FUNCTION_TRAITS[fn];
  const rawSkill = traits.reduce((s, t) => s + employee.traits[t], 0) / traits.length;
  return rawSkill * roleAffinity;
}

/** Sum of an employee's declared weekly-capacity allocation across every function, in percent. 100 = exactly one FTE's worth of committed time. */
export function totalAllocationPct(employee: Employee): number {
  return WORK_FUNCTIONS.reduce((s, fn) => s + (employee.allocation[fn] ?? 0), 0);
}

/**
 * 1.0 at or under 100% allocated; degrades toward a floor the further someone is stretched past
 * a full week's worth of committed time — spreading yourself thin has a real, visible cost rather
 * than being a free way to multiply output.
 */
export function computeOverallocationPenalty(totalPct: number): number {
  if (totalPct <= 100) return 1;
  const overBy = (totalPct - 100) / 100; // 0.4 => 40% over
  return Math.max(0.55, 1 - overBy * 0.6);
}

export interface PerformanceResult {
  coreSkill: number; // 0-100, blended relevant-trait score
  rampFactor: number; // 0-1, how ramped-up the employee is
  moraleFactor: number;
  fatigueFactor: number;
  outputFactor: number; // multiply against a role's base output contribution; 1.0 = solid full performer
  errorRate: number; // 0-1ish probability/severity of mistakes this week
  performanceScore: number; // 0-100 composite for tone classification
}

export function computeWeeklyPerformance(employee: Employee, currentWeek: number, rng: RngState): PerformanceResult {
  const traits = RELEVANT_TRAITS[employee.department];
  const coreSkill = traits.reduce((s, t) => s + employee.traits[t], 0) / traits.length;

  const tenureWeeks = currentWeek - employee.hireWeek;
  const learningSpeed = 0.5 + employee.traits.learningAbility / 100; // 0.5 - 1.5
  const rampFactor = Math.max(0.35, Math.min(1, 0.35 + (tenureWeeks / (10 / learningSpeed))));

  const moraleFactor = 0.65 + (employee.morale / 100) * 0.45; // 0.65 - 1.10
  const fatigueFactor = 1 - (employee.fatigue / 100) * 0.25; // 0.75 - 1.0
  const overallocationPenalty = computeOverallocationPenalty(totalAllocationPct(employee));

  const noise = nextNormal(rng, 1, 0.08);
  const outputFactor = Math.max(0.1, (coreSkill / 68) * rampFactor * moraleFactor * fatigueFactor * overallocationPenalty * noise);

  const baseErrorRate = (100 - employee.traits.attentionToDetail) / 100 * 0.18 + (100 - employee.traits.reliability) / 100 * 0.08;
  const errorRate = Math.max(0.005, baseErrorRate * (1 / rampFactor) * (1 + employee.fatigue / 200) * (2 - overallocationPenalty));

  const performanceScore = Math.max(0, Math.min(100, coreSkill * 0.5 + rampFactor * 30 + moraleFactor * 20 - errorRate * 40));

  return { coreSkill, rampFactor, moraleFactor, fatigueFactor, outputFactor, errorRate, performanceScore };
}

export function updateMoraleAndFatigue(employee: Employee, params: { weekWasHeavy: boolean; recentRaise: boolean; recentRecognition: boolean }): { morale: number; fatigue: number } {
  let morale = employee.morale;
  let fatigue = employee.fatigue;

  fatigue = params.weekWasHeavy ? Math.min(100, fatigue + 12) : Math.max(0, fatigue - 8);
  if (params.recentRaise) morale = Math.min(100, morale + 10);
  if (params.recentRecognition) morale = Math.min(100, morale + 4);
  if (fatigue > 75) morale = Math.max(0, morale - 3);
  // slow drift toward a personality-driven baseline around 60
  morale += (60 - morale) * 0.02;

  return { morale: Math.round(morale), fatigue: Math.round(fatigue) };
}
