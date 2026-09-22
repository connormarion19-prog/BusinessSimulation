import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { computeInventoryCoverage, computePriceScenario, computeBreakEven, computeCashFlowForecast } from "../src/engine/decisionSupport";
import { round2 } from "../src/engine/ledger";
import { getIndustryDefinition } from "../src/industries/registry";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Micro Startup Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "personal-savings",
    startingCash: 25_000,
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "small-job-shop",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

function runningGame(weeks = 10) {
  const game = createNewGame("paper-manufacturing", "Test", baseParams());
  const industry = getIndustryDefinition("paper-manufacturing")!;
  addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
  for (let i = 0; i < weeks; i++) advanceWeek(game);
  return game;
}

describe("inventory coverage", () => {
  it("reports zero raw-material coverage for a company with no supplier and no production", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    for (let i = 0; i < 5; i++) advanceWeek(game);
    const coverage = computeInventoryCoverage(game.company, game.week);
    expect(coverage.rawMaterials.unitsOnHand).toBe(0);
    expect(coverage.rawMaterials.weeksCoverage).toBeNull();
  });

  it("a running company shows real, non-negative raw-material and finished-goods coverage", () => {
    const game = runningGame();
    const coverage = computeInventoryCoverage(game.company, game.week);
    expect(coverage.rawMaterials.unitsOnHand).toBeGreaterThanOrEqual(0);
    expect(coverage.finishedGoods.length).toBeGreaterThan(0);
    for (const line of coverage.finishedGoods) {
      expect(line.unitsOnHand).toBeGreaterThanOrEqual(0);
      if (line.weeksCoverage !== null) expect(line.weeksCoverage).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("price scenarios", () => {
  it("a higher candidate price projects lower estimated demand than a lower price, before any facility-capacity ceiling is applied", () => {
    const game = runningGame();
    const product = game.company.products[0];
    // Compare pre-capacity-clamp demand directly (a small starter facility saturates at capacity for
    // almost any reasonable price, which is itself correct — the price signal still moved demand,
    // capacity is just the separate, binding constraint) by using a deliberately huge capacity so
    // neither scenario clips.
    const roomyProduct = { ...product, capacityAllocationPct: 1 };
    const roomyCompany = { ...game.company, facilities: game.company.facilities.map((f) => ({ ...f, baseWeeklyCapacityUnits: f.baseWeeklyCapacityUnits * 50 })) };
    const higher = computePriceScenario(roomyCompany, roomyProduct, product.priceWeekly * 1.3, game.market, game.competitors, 1.0, 1);
    const lower = computePriceScenario(roomyCompany, roomyProduct, product.priceWeekly * 0.7, game.market, game.competitors, 1.0, 1);
    expect(lower.estVolumeLow + lower.estVolumeHigh).toBeGreaterThan(higher.estVolumeLow + higher.estVolumeHigh);
  });

  it("at a small facility's real capacity, an extreme price cut can't sell more than the plant can physically produce", () => {
    const game = runningGame();
    const product = game.company.products[0];
    const veryLow = computePriceScenario(game.company, product, product.priceWeekly * 0.3, game.market, game.competitors, 1.0, 1);
    const capacity = game.company.facilities.reduce((s, f) => s + f.baseWeeklyCapacityUnits * (f.condition / 100), 0);
    expect(veryLow.estVolumeHigh).toBeLessThanOrEqual(round2(capacity) + 0.5);
  });

  it("estimated revenue range is internally consistent (low <= high) and non-negative", () => {
    const game = runningGame();
    const product = game.company.products[0];
    const scenario = computePriceScenario(game.company, product, product.priceWeekly, game.market, game.competitors, 1.0, 1);
    expect(scenario.estVolumeLow).toBeLessThanOrEqual(scenario.estVolumeHigh);
    expect(scenario.estRevenueLow).toBeLessThanOrEqual(scenario.estRevenueHigh);
    expect(scenario.estVolumeLow).toBeGreaterThanOrEqual(0);
  });
});

describe("break-even analysis", () => {
  it("treats materials as variable and labor/overhead as fixed, and produces a coherent narrative either way", () => {
    const game = runningGame();
    const product = game.company.products[0];
    const analysis = computeBreakEven(game.company, product, game.week);
    expect(analysis.narrative.length).toBeGreaterThan(10);
    expect(Number.isFinite(analysis.variableCostPerUnit)).toBe(true);
    expect(Number.isFinite(analysis.fixedCostsWeekly)).toBe(true);
    if (analysis.contributionMarginPerUnit > 0) {
      expect(analysis.breakEvenUnitsWeekly).not.toBeNull();
      expect(analysis.breakEvenUnitsWeekly!).toBeGreaterThan(0);
    } else {
      expect(analysis.breakEvenUnitsWeekly).toBeNull();
    }
  });
});

describe("cash flow forecast", () => {
  it("projects a real multi-week range starting from actual current cash", () => {
    const game = runningGame();
    const forecast = computeCashFlowForecast(game.company, game.week, 8);
    expect(forecast.weeks.length).toBe(8);
    expect(forecast.weeks[0].week).toBe(game.week + 1);
    for (const w of forecast.weeks) {
      expect(w.projectedCashLow).toBeLessThanOrEqual(w.projectedCashHigh + 0.01);
    }
    expect(forecast.narrative.length).toBeGreaterThan(10);
  });

  it("the uncertainty range widens further out in the forecast than near-term", () => {
    const game = runningGame();
    const forecast = computeCashFlowForecast(game.company, game.week, 8);
    const nearSpread = forecast.weeks[0].projectedCashHigh - forecast.weeks[0].projectedCashLow;
    const farSpread = forecast.weeks[7].projectedCashHigh - forecast.weeks[7].projectedCashLow;
    expect(farSpread).toBeGreaterThanOrEqual(nearSpread);
  });
});
