import { createNewGame } from "../src/engine/newGame";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { getIndustryDefinition } from "../src/industries/registry";
import type { GameState } from "../src/types/core";
import type { NewCompanyParams } from "../src/types/industry";

/**
 * Phase 4 removed the free starting supplier/customers — a brand-new company now begins with
 * neither, and the player has to establish a raw-material source before production can run (see
 * engine/prospecting.ts and engine/suppliers.ts). Most existing tests exist to exercise some OTHER
 * system and just need a working supply chain in place, so this wrapper creates a game and
 * immediately establishes one starting supplier, matching the pre-Phase-4 default. Tests that
 * specifically exercise the zero-supplier/zero-customer startup experience should call
 * createNewGame directly instead.
 */
export function createTestGame(industryId: string, saveName: string, params: NewCompanyParams, supplierTemplateId = "regional-pulp-co"): GameState {
  const game = createNewGame(industryId, saveName, params);
  const industry = getIndustryDefinition(industryId)!;
  addSupplierToCompany(game.company, industry, supplierTemplateId, game.week, game.currentDate);
  return game;
}
