import type { Department, Employee, EmployeeTraits } from "../types/employee";
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
};

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

  const noise = nextNormal(rng, 1, 0.08);
  const outputFactor = Math.max(0.1, (coreSkill / 68) * rampFactor * moraleFactor * fatigueFactor * noise);

  const baseErrorRate = (100 - employee.traits.attentionToDetail) / 100 * 0.18 + (100 - employee.traits.reliability) / 100 * 0.08;
  const errorRate = Math.max(0.005, baseErrorRate * (1 / rampFactor) * (1 + employee.fatigue / 200));

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
