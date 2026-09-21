import type { GameState } from "../types/core";
import type { NewCompanyParams } from "../types/industry";
import { createRng } from "./rng";
import { getIndustryDefinition } from "../industries/registry";
import { generateInitialCompetitors } from "./competitors";
import { createInitialEconomy } from "./economy";

export function createNewGame(industryId: string, saveName: string, params: NewCompanyParams): GameState {
  const industry = getIndustryDefinition(industryId);
  if (!industry) throw new Error(`Unknown or unimplemented industry: ${industryId}`);

  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const rng = createRng(seed);
  const { company, market } = industry.createInitialState(params, rng);
  const competitors = generateInitialCompetitors(market, params.foundedWeek, rng, 3);
  const economy = createInitialEconomy(params.difficulty);

  return {
    meta: {
      saveId: `save-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      saveName,
      difficulty: params.difficulty,
      createdAt: new Date().toISOString(),
      lastPlayedAt: new Date().toISOString(),
    },
    week: params.foundedWeek,
    currentDate: params.foundedDate,
    rng,
    company,
    economy,
    competitors,
    market,
    pendingDecisions: [],
    lastBriefing: null,
    lastRevenueCausal: null,
    lastProfitCausal: null,
    lastEvaluations: [],
    recentEventLog: [],
  };
}
