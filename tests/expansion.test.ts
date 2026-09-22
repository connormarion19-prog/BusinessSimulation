import { describe, expect, it } from "vitest";
import { createTestGame } from "./testHelpers";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance, accountBalance } from "../src/engine/ledger";
import { balanceSheetAsOf } from "../src/engine/reports";
import { openFacilityForCompany } from "../src/engine/facilities";
import { enterMarket, exitMarket } from "../src/engine/expansion";
import { transferInventory } from "../src/engine/logistics";
import { getIndustryDefinition } from "../src/industries/registry";
import type { Employee, EmployeeTraits } from "../src/types/employee";
import type { NewCompanyParams } from "../src/types/industry";
import type { CustomerAccount } from "../src/types/core";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Expansion Test Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "bank-loan",
    startingCash: 500_000,
    loanTerms: { principal: 400_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" },
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "mid-size-mill",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

const NEUTRAL_TRAITS: EmployeeTraits = {
  technicalAbility: 65,
  reliability: 65,
  attentionToDetail: 65,
  communication: 65,
  initiative: 65,
  judgment: 65,
  leadership: 65,
  learningAbility: 65,
  adaptability: 65,
  organization: 65,
};

function makeProductionEmployee(id: string, facilityId: string): Employee {
  return {
    id,
    name: `Test ${id}`,
    age: 35,
    location: "Regional",
    roleId: "production-worker",
    title: "Production Worker",
    department: "production",
    hireWeek: 0,
    salaryWeekly: 750,
    managerId: null,
    facilityId,
    allocation: { accounting: 0, purchasing: 0, sales: 0, operations: 100, administration: 0 },
    traits: { ...NEUTRAL_TRAITS },
    education: { degree: "Associate's Degree", field: "Industrial Engineering", school: "Community College" },
    priorEmployers: [],
    status: "active",
    morale: 60,
    fatigue: 10,
    performanceHistory: [],
    cumulativeErrors: 0,
    cumulativeTasksCompleted: 0,
    lastRaiseWeek: null,
    onPip: false,
  };
}

describe("facility ownership & financing", () => {
  it("purchasing a facility in cash books it to PP&E with no new loan", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const loansBefore = game.company.loans.length;
    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "or-portland", game.week, game.currentDate, "purchase", "cash");
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    expect(game.company.loans.length).toBe(loansBefore);
    expect(result.facility!.ownedOutright).toBe(true);
    expect(result.facility!.status).toBe("operating");
    expect(accountBalance(game.company.entries, "ppe", game.week)).toBeCloseTo(result.facility!.purchaseValue, 2);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });

  it("purchasing with loan financing draws a real amortizing note", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const loansBefore = game.company.loans.length;
    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "or-portland", game.week, game.currentDate, "purchase", "loan");
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    expect(game.company.loans.length).toBe(loansBefore + 1);
    const newLoan = game.company.loans[game.company.loans.length - 1];
    expect(newLoan.originalPrincipal).toBeCloseTo(result.facility!.purchaseValue, 2);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });

  it("a facility under construction contributes no capacity until it completes, then converts to PP&E", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "tx-tyler", game.week, game.currentDate, "construction", "cash");
    game.company.entries.push(...result.entries);
    const facilityId = result.facility!.id;
    expect(result.facility!.status).toBe("under-construction");
    const completeWeek = result.facility!.constructionCompleteWeek!;
    expect(completeWeek).toBeGreaterThan(game.week);
    expect(accountBalance(game.company.entries, "construction-in-progress", game.week)).toBeCloseTo(result.facility!.purchaseValue, 2);

    for (let i = 0; i < completeWeek + 1; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }

    const facility = game.company.facilities.find((f) => f.id === facilityId)!;
    expect(facility.status).toBe("operating");
    expect(accountBalance(game.company.entries, "ppe", game.week)).toBeGreaterThan(0);
    expect(accountBalance(game.company.entries, "construction-in-progress", game.week)).toBeCloseTo(0, 2);
  });
});

describe("geographic market entry", () => {
  it("a remote entry becomes active after its ramp-up lag and generates attributed regional revenue", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const productId = game.company.products[0].id;

    const regionalCustomer: CustomerAccount = {
      id: "regional-cust-1",
      name: "Ohio Print Partners",
      productId,
      segment: game.company.targetCustomerSegment,
      location: "Ohio",
      locationId: "oh-columbus",
      annualVolumeUnits: 8000,
      priceSensitivity: 0.5,
      qualityExpectation: 0.6,
      paymentTermsDays: 30,
      relationshipStrength: 60,
      contractedSince: game.week,
      lastOrderWeek: null,
      atRisk: false,
    };
    game.company.customers.push(regionalCustomer);

    for (let i = 0; i < 3; i++) {
      game.company.employees.push(makeProductionEmployee(`pw-${i}`, game.company.facilities[0].id));
    }

    const result = enterMarket(
      game.company,
      industry,
      game.market,
      game.competitors,
      { locationId: "oh-columbus", productId, mode: "remote" },
      game.week,
      game.currentDate,
      game.rng,
    );
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    expect(game.market.regions["oh-columbus"]).toBeDefined();
    const entry = game.company.enteredMarkets[0];
    expect(entry.status).toBe("entering");

    for (let i = 0; i < 30; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
    }

    const finalEntry = game.company.enteredMarkets.find((e) => e.id === entry.id)!;
    expect(finalEntry.status).toBe("active");
    expect(finalEntry.actualWeeksActive).toBeGreaterThan(0);
    expect(finalEntry.actualRevenueToDate).toBeGreaterThan(0);
  });

  it("a warehouse entry opens a real distribution-center facility with zero production capacity", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const productId = game.company.products[0].id;
    const result = enterMarket(
      game.company,
      industry,
      game.market,
      game.competitors,
      { locationId: "ga-savannah", productId, mode: "warehouse", ownershipType: "lease" },
      game.week,
      game.currentDate,
      game.rng,
    );
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    const facility = game.company.facilities.find((f) => f.id === result.entry!.facilityId)!;
    expect(facility.role).toBe("distribution");
    expect(facility.baseWeeklyCapacityUnits).toBe(0);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });

  it("refuses to double-enter the same market for the same product", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const productId = game.company.products[0].id;
    const params = { locationId: "pa-erie", productId, mode: "remote" as const };
    const first = enterMarket(game.company, industry, game.market, game.competitors, params, game.week, game.currentDate, game.rng);
    game.company.entries.push(...first.entries);
    const second = enterMarket(game.company, industry, game.market, game.competitors, params, game.week, game.currentDate, game.rng);
    expect(second.ok).toBe(false);
  });

  it("exiting a market marks the entry exited and stops further ramp-up", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const productId = game.company.products[0].id;
    const result = enterMarket(
      game.company,
      industry,
      game.market,
      game.competitors,
      { locationId: "pa-erie", productId, mode: "remote" },
      game.week,
      game.currentDate,
      game.rng,
    );
    game.company.entries.push(...result.entries);
    expect(exitMarket(game.company, result.entry!.id, game.week, game.currentDate)).toBe(true);
    expect(game.company.enteredMarkets[0].status).toBe("exited");
    advanceWeek(game);
    expect(game.company.enteredMarkets[0].status).toBe("exited");
  });
});

describe("internal transfers & logistics", () => {
  it("transfers deduct source inventory immediately, book freight, and land at the destination after transit", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const product = game.company.products[0];
    const homeFacilityId = game.company.facilities[0].id;
    product.inventoryUnits = 1000;
    product.facilityInventory[homeFacilityId] = 1000;

    const opened = openFacilityForCompany(game.company, industry, "distribution-center", "tx-tyler", game.week, game.currentDate, "lease", "cash");
    game.company.entries.push(...opened.entries);
    const warehouseId = opened.facility!.id;
    product.facilityInventory[warehouseId] = 0;

    const result = transferInventory(game.company, product.id, homeFacilityId, warehouseId, 500, game.week, game.currentDate);
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    expect(product.facilityInventory[homeFacilityId]).toBeCloseTo(500, 2);
    expect(product.facilityInventory[warehouseId]).toBeCloseTo(0, 2); // not landed yet
    expect(product.inventoryUnits).toBeCloseTo(1000, 2); // total company-owned inventory unaffected by transit
    expect(game.company.inTransitShipments.length).toBe(1);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);

    const arrivalWeek = game.company.inTransitShipments[0].arrivalWeek;
    for (let i = game.week; i <= arrivalWeek; i++) advanceWeek(game);
    expect(game.company.inTransitShipments.length).toBe(0);
    expect(product.facilityInventory[warehouseId]).toBeGreaterThan(0);
  });

  it("caps a transfer at the destination's remaining storage capacity", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const product = game.company.products[0];
    const homeFacilityId = game.company.facilities[0].id;
    product.inventoryUnits = 50_000;
    product.facilityInventory[homeFacilityId] = 50_000;

    const opened = openFacilityForCompany(game.company, industry, "distribution-center", "tx-tyler", game.week, game.currentDate, "lease", "cash");
    game.company.entries.push(...opened.entries);
    const warehouseId = opened.facility!.id;
    product.facilityInventory[warehouseId] = 0;

    const result = transferInventory(game.company, product.id, homeFacilityId, warehouseId, 50_000, game.week, game.currentDate);
    expect(result.ok).toBe(true);
    expect(result.quantityShipped!).toBeLessThanOrEqual(opened.facility!.storageCapacityUnits);
  });

  it("refuses a transfer with no inventory at the source", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const product = game.company.products[0];
    const opened = openFacilityForCompany(game.company, industry, "distribution-center", "tx-tyler", game.week, game.currentDate, "lease", "cash");
    game.company.entries.push(...opened.entries);
    const result = transferInventory(game.company, product.id, game.company.facilities[0].id, opened.facility!.id, 100, game.week, game.currentDate);
    expect(result.ok).toBe(false);
  });
});

describe("long-horizon multi-facility, multi-region integration", () => {
  it("runs 110 weeks across two facilities and two markets with the accounting identity intact every week", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams({ facilityTemplateId: "small-job-shop" }));
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const productId = game.company.products[0].id;

    const opened = openFacilityForCompany(game.company, industry, "small-job-shop", "tx-tyler", game.week, game.currentDate, "lease", "cash");
    game.company.entries.push(...opened.entries);
    const branchId = opened.facility!.id;
    for (const p of game.company.products) if (p.facilityInventory[branchId] === undefined) p.facilityInventory[branchId] = 0;

    for (let i = 0; i < 3; i++) {
      game.company.employees.push(makeProductionEmployee(`pw-home-${i}`, game.company.facilities[0].id));
      game.company.employees.push(makeProductionEmployee(`pw-branch-${i}`, branchId));
    }

    const entryResult = enterMarket(
      game.company,
      industry,
      game.market,
      game.competitors,
      { locationId: "oh-columbus", productId, mode: "remote" },
      game.week,
      game.currentDate,
      game.rng,
    );
    game.company.entries.push(...entryResult.entries);

    for (let i = 0; i < 110; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
      // Every product's tracked physical inventory should reconcile with the pooled sellable total.
      for (const product of game.company.products) {
        const bucketSum = Object.values(product.facilityInventory).reduce((s, v) => s + v, 0);
        const inTransit = game.company.inTransitShipments.filter((s) => s.productId === product.id).reduce((s, sh) => s + sh.quantity, 0);
        expect(bucketSum + inTransit).toBeCloseTo(product.inventoryUnits, 0);
      }
    }

    expect(Object.keys(game.market.regions).length).toBeGreaterThanOrEqual(2);
    expect(game.company.enteredMarkets[0].status).toBe("active");
  });
});
