import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { getIndustryDefinition } from "../src/industries/registry";
import { makeTestCustomer } from "./testHelpers";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Milestone Co.",
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

describe("business milestones", () => {
  it("records a first-commercial-sale milestone exactly once, when real units are first sold", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    game.company.customers.push(makeTestCustomer({ id: "c1", name: "Reliable Co.", productId: game.company.products[0].id, locationId: game.company.locationId, relationshipStrength: 80 }));
    for (let i = 0; i < 15; i++) advanceWeek(game);
    const firstSaleEntries = game.company.historyLog.filter((h) => h.headline === "First commercial sale");
    expect(firstSaleEntries.length).toBe(1);
  });

  it("does not record a first-sale milestone for a company that never produces or sells anything", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    for (let i = 0; i < 8; i++) advanceWeek(game);
    expect(game.company.historyLog.some((h) => h.headline === "First commercial sale")).toBe(false);
  });

  it("reputation starts neutral and only ever stays within 0-100", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    expect(game.company.reputation).toBe(50);
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    game.company.customers.push(makeTestCustomer({ id: "c1", name: "Struggling Co.", productId: game.company.products[0].id, locationId: game.company.locationId, relationshipStrength: 10, annualVolumeUnits: 50000 }));
    for (let i = 0; i < 20; i++) advanceWeek(game);
    expect(game.company.reputation).toBeGreaterThanOrEqual(0);
    expect(game.company.reputation).toBeLessThanOrEqual(100);
  });
});
