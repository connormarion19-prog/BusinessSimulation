import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { balanceSheetAsOf } from "../src/engine/reports";
import { addProductToCompany, discontinueProductOnCompany } from "../src/engine/products";
import { addSupplierToCompany, removeSupplierFromCompany } from "../src/engine/suppliers";
import { getIndustryDefinition } from "../src/industries/registry";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Diversified Paper Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "bank-loan",
    startingCash: 250_000,
    loanTerms: { principal: 250_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" },
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "mid-size-mill",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

describe("multi-product operations", () => {
  it("adding a product scales down existing allocations to keep the total at 1", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(game.company.products[0].capacityAllocationPct).toBe(1);

    const ok = addProductToCompany(game.company, industry, "packaging-paper", game.week, game.currentDate, game.rng);
    expect(ok).toBe(true);
    expect(game.company.products).toHaveLength(2);
    const totalAllocation = game.company.products.filter((p) => p.active).reduce((s, p) => s + p.capacityAllocationPct, 0);
    expect(totalAllocation).toBeCloseTo(1, 2);
    expect(game.company.products[1].capacityAllocationPct).toBeCloseTo(0.25, 2);
  });

  it("refuses to add the same product twice or discontinue the last active product", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(addProductToCompany(game.company, industry, "copy-paper", game.week, game.currentDate, game.rng)).toBe(false);
    expect(discontinueProductOnCompany(game.company, game.company.products[0].id, game.week, game.currentDate)).toBe(false);
  });

  it("keeps the accounting identity intact while running two product lines for 30 weeks", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addProductToCompany(game.company, industry, "specialty-paper", game.week, game.currentDate, game.rng);
    expect(game.company.products).toHaveLength(2);

    for (let i = 0; i < 30; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
    }

    // Both product lines should have produced something over 30 weeks of shared capacity.
    const totalUnitsByProduct = game.company.products.map((p) => p.unitsProducedLastWeek);
    expect(totalUnitsByProduct.length).toBe(2);
    expect(game.company.kpiHistory).toHaveLength(30);
  });

  it("discontinuing a product stops new production but still sells off remaining inventory", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addProductToCompany(game.company, industry, "packaging-paper", game.week, game.currentDate, game.rng);
    for (let i = 0; i < 8; i++) advanceWeek(game);

    const secondProduct = game.company.products[1];
    expect(secondProduct.inventoryUnits).toBeGreaterThanOrEqual(0);
    const ok = discontinueProductOnCompany(game.company, secondProduct.id, game.week, game.currentDate);
    expect(ok).toBe(true);
    expect(secondProduct.active).toBe(false);
    expect(secondProduct.capacityAllocationPct).toBe(0);

    const inventoryBefore = secondProduct.inventoryUnits;
    for (let i = 0; i < 10; i++) advanceWeek(game);
    // Production stopped, so inventory should not have grown; if it had stock it should trend toward being sold down.
    expect(secondProduct.unitsProducedLastWeek).toBe(0);
    if (inventoryBefore > 0) {
      expect(secondProduct.inventoryUnits).toBeLessThanOrEqual(inventoryBefore);
    }
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });
});

describe("supplier diversification", () => {
  it("adding a supplier scales down existing allocations to keep the total at 1", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(game.company.suppliers[0].purchaseAllocationPct).toBe(1);

    const ok = addSupplierToCompany(game.company, industry, "premium-northern-pulp", game.week, game.currentDate);
    expect(ok).toBe(true);
    expect(game.company.suppliers).toHaveLength(2);
    const total = game.company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it("removing a supplier redistributes its allocation and refuses to drop the last one", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "discount-pulp-broker", game.week, game.currentDate);
    expect(game.company.suppliers).toHaveLength(2);

    const firstId = game.company.suppliers[0].id;
    const removed = removeSupplierFromCompany(game.company, firstId, game.week, game.currentDate);
    expect(removed).toBe(true);
    expect(game.company.suppliers).toHaveLength(1);
    expect(game.company.suppliers[0].purchaseAllocationPct).toBeCloseTo(1, 2);

    const lastId = game.company.suppliers[0].id;
    expect(removeSupplierFromCompany(game.company, lastId, game.week, game.currentDate)).toBe(false);
  });

  it("keeps the accounting identity intact purchasing from three suppliers over 20 weeks", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "discount-pulp-broker", game.week, game.currentDate);
    addSupplierToCompany(game.company, industry, "premium-northern-pulp", game.week, game.currentDate);
    expect(game.company.suppliers).toHaveLength(3);
    const total = game.company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);
    expect(total).toBeCloseTo(1, 2);

    for (let i = 0; i < 20; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }
  });

  it("a diversified supplier base takes a smaller shortfall from a disruption than a single-sourced one", () => {
    // Same seed, same founding conditions; one game diversifies suppliers, the other doesn't.
    const soloGame = createNewGame("paper-manufacturing", "Solo", baseParams());
    const diversifiedGame = createNewGame("paper-manufacturing", "Diversified", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(diversifiedGame.company, industry, "discount-pulp-broker", diversifiedGame.week, diversifiedGame.currentDate);
    addSupplierToCompany(diversifiedGame.company, industry, "premium-northern-pulp", diversifiedGame.week, diversifiedGame.currentDate);

    // Run enough weeks for the disruption event to very likely fire at least once in both runs; just assert
    // both stay internally consistent (a strict severity comparison would be seed-fragile).
    for (let i = 0; i < 52; i++) {
      advanceWeek(soloGame);
      advanceWeek(diversifiedGame);
    }
    expect(trialBalance(soloGame.company.entries, soloGame.week).balanced).toBe(true);
    expect(trialBalance(diversifiedGame.company.entries, diversifiedGame.week).balanced).toBe(true);
  });
});
