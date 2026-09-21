import type { IndustryEventDefinition, IndustrySimContext } from "../types/industry";
import type { Difficulty } from "../types/core";
import type { JournalEntry } from "../types/finance";
import type { HistoryEvent } from "../types/core";
import { chance, nextInt } from "./rng";

export interface EventEngineResult {
  entries: JournalEntry[];
  narratives: string[];
  historyEvents: HistoryEvent[];
  firedEventIds: string[];
}

function difficultyMultiplier(difficulty: Difficulty, severity: "positive" | "negative"): number {
  if (difficulty === "easy") return severity === "negative" ? 0.7 : 1.15;
  return 1.0;
}

/** Rolls the industry's event pool for this week. At most one discrete event fires per week, to keep the briefing legible. */
export function rollWeeklyEvents(
  pool: IndustryEventDefinition[],
  ctx: IndustrySimContext,
  difficulty: Difficulty,
): EventEngineResult {
  const eligible = pool.filter((e) => e.eligible(ctx));
  const order = [...eligible];
  // Fisher-Yates using the sim rng so this stays part of the deterministic seed chain.
  for (let i = order.length - 1; i > 0; i--) {
    const j = nextInt(ctx.rng, 0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const event of order) {
    const probability = event.baseWeeklyProbability * difficultyMultiplier(difficulty, event.severity);
    if (chance(ctx.rng, probability)) {
      const effect = event.apply(ctx);
      return {
        entries: effect.entries,
        narratives: [effect.narrative],
        historyEvents: effect.historyEvent ? [effect.historyEvent] : [],
        firedEventIds: [event.id],
      };
    }
  }
  return { entries: [], narratives: [], historyEvents: [], firedEventIds: [] };
}
