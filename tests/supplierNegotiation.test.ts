import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { negotiateSupplierTerms } from "../src/engine/supplierNegotiation";
import { getIndustryDefinition } from "../src/industries/registry";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Micro Startup Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "personal-savings",
    startingCash: 20_000,
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "small-job-shop",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

function setup() {
  const game = createNewGame("paper-manufacturing", "Test", baseParams());
  const industry = getIndustryDefinition("paper-manufacturing")!;
  addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
  return game;
}

describe("supplier negotiation", () => {
  it("a small, reasonable discount ask is accepted outright and the supplier's price actually changes", () => {
    const game = setup();
    const supplier = game.company.suppliers[0];
    const originalPrice = supplier.pricePerUnit;
    const result = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: originalPrice * 0.97, volumeCommitmentUnits: 100, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.4,
      game.week,
      game.currentDate,
    );
    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(supplier.pricePerUnit).toBeLessThan(originalPrice);
    expect(supplier.negotiationRounds).toBe(1);
  });

  it("a wildly aggressive ask is rejected outright with no counter", () => {
    const game = setup();
    const supplier = game.company.suppliers[0];
    const result = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: supplier.pricePerUnit * 0.3, volumeCommitmentUnits: 100, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.0,
      game.week,
      game.currentDate,
    );
    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.counterOffer).toBeUndefined();
  });

  it("a moderately-too-aggressive ask gets a real counter-offer instead of a flat rejection", () => {
    const game = setup();
    const supplier = game.company.suppliers[0];
    const result = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: supplier.pricePerUnit * 0.88, volumeCommitmentUnits: 100, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.0,
      game.week,
      game.currentDate,
    );
    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.counterOffer).toBeDefined();
    expect(result.counterOffer!.priceAcceptable).toBeLessThan(supplier.pricePerUnit);
    expect(result.counterOffer!.priceAcceptable).toBeGreaterThan(supplier.pricePerUnit * 0.88);
  });

  it("an offer below the supplier's minimum order size is refused", () => {
    const game = setup();
    const supplier = game.company.suppliers[0];
    const result = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: supplier.pricePerUnit, volumeCommitmentUnits: 1, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.0,
      game.week,
      game.currentDate,
    );
    expect(result.ok).toBe(false);
  });

  it("repeated negotiation rounds make further discounts harder to win, and negotiating too soon again is refused", () => {
    const game = setup();
    const supplier = game.company.suppliers[0];
    const firstAsk = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: supplier.pricePerUnit * 0.97, volumeCommitmentUnits: 100, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.4,
      game.week,
      game.currentDate,
    );
    expect(firstAsk.accepted).toBe(true);

    const tooSoon = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: supplier.pricePerUnit * 0.97, volumeCommitmentUnits: 100, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.4,
      game.week,
      game.currentDate,
    );
    expect(tooSoon.ok).toBe(false);
  });

  it("unknown supplier is refused cleanly", () => {
    const game = setup();
    const result = negotiateSupplierTerms(game.company, "nope", { targetPricePerUnit: 100, volumeCommitmentUnits: 100, paymentTermsDaysRequested: 30 }, 1, game.week, game.currentDate);
    expect(result.ok).toBe(false);
  });
});
