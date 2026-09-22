import { createNewGame } from "../src/engine/newGame";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { getIndustryDefinition } from "../src/industries/registry";
import type { CustomerAccount, GameState } from "../src/types/core";
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

/** Builds a fully-formed CustomerAccount for tests that don't care about the Phase 5 contract/payment-history
 * fields specifically — just override whatever the test does care about. */
export function makeTestCustomer(overrides: Partial<CustomerAccount> & Pick<CustomerAccount, "id" | "name" | "productId">): CustomerAccount {
  return {
    segment: "regional-distributors",
    location: "Regional",
    locationId: "wi-greenbay",
    annualVolumeUnits: 2000,
    priceSensitivity: 0.5,
    qualityExpectation: 0.5,
    paymentTermsDays: 30,
    relationshipStrength: 60,
    contractedSince: 0,
    contractLengthWeeks: 52,
    contractEndWeek: 52,
    lastOrderWeek: null,
    atRisk: false,
    paymentReliability: 80,
    ordersFulfilled: 0,
    ordersMissed: 0,
    complaints: 0,
    ...overrides,
  };
}
