import type { Difficulty, EconomyState } from "../types/core";
import type { RngState } from "./rng";
import { chance, nextRange } from "./rng";
import { round2 } from "./ledger";

export function createInitialEconomy(difficulty: Difficulty): EconomyState {
  return {
    interestRateAnnual: difficulty === "easy" ? 0.055 : 0.065,
    inflationAnnual: 0.028,
    demandIndex: 1.0,
    cyclePhase: "expansion",
    weeksInPhase: 0,
  };
}

const NEXT_PHASE: Record<EconomyState["cyclePhase"], EconomyState["cyclePhase"]> = {
  expansion: "peak",
  peak: "contraction",
  contraction: "trough",
  trough: "expansion",
};

export function advanceEconomy(economy: EconomyState, rng: RngState, difficulty: Difficulty): EconomyState {
  const weeksInPhase = economy.weeksInPhase + 1;
  const minPhaseWeeks = economy.cyclePhase === "peak" || economy.cyclePhase === "trough" ? 10 : 40;
  let cyclePhase = economy.cyclePhase;
  let resetWeeks = weeksInPhase;
  if (weeksInPhase > minPhaseWeeks && chance(rng, 0.04)) {
    cyclePhase = NEXT_PHASE[economy.cyclePhase];
    resetWeeks = 0;
  }

  const phaseTarget: Record<EconomyState["cyclePhase"], number> = {
    expansion: 1.04,
    peak: 1.08,
    contraction: 0.93,
    trough: 0.85,
  };
  const target = phaseTarget[cyclePhase] * (difficulty === "easy" ? 1.02 : 1.0);
  const demandIndex = round2(economy.demandIndex + (target - economy.demandIndex) * 0.06 + nextRange(rng, -0.01, 0.01));

  const rateTarget = cyclePhase === "contraction" || cyclePhase === "trough" ? 0.045 : 0.075;
  const interestRateAnnual = round2(economy.interestRateAnnual + (rateTarget - economy.interestRateAnnual) * 0.03 + nextRange(rng, -0.001, 0.001));
  const inflationAnnual = round2(Math.max(0.005, economy.inflationAnnual + nextRange(rng, -0.001, 0.0012)));

  return {
    interestRateAnnual: Math.max(0.02, Math.min(0.14, interestRateAnnual)),
    inflationAnnual,
    demandIndex: Math.max(0.6, Math.min(1.35, demandIndex)),
    cyclePhase,
    weeksInPhase: resetWeeks,
  };
}
