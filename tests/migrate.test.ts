import { describe, expect, it } from "vitest";
import { migrateGameState } from "../src/engine/migrate";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";

/** A save shaped like the very first release: single product/supplier, no delegation, no facilityId, etc. */
function legacySaveFixture(): unknown {
  return {
    meta: { saveId: "legacy-1", saveName: "Legacy Save", difficulty: "realistic", createdAt: "2025-01-01T00:00:00.000Z", lastPlayedAt: "2025-01-01T00:00:00.000Z" },
    week: 3,
    currentDate: "2025-01-27",
    rng: { state: 12345 },
    company: {
      id: "co-legacy",
      name: "Legacy Paper Co.",
      industryId: "paper-manufacturing",
      locationId: "wi-greenbay",
      foundedWeek: 0,
      foundedDate: "2025-01-06",
      stage: "founder",
      entries: [
        { id: "je-1", week: 0, date: "2025-01-06", memo: "Founder cash contribution", source: "owner-contribution", lines: [{ accountId: "cash", debit: 100000, credit: 0 }, { accountId: "owner-contributions", debit: 0, credit: 100000 }] },
      ],
      loans: [],
      facilities: [
        { id: "facility-1", name: "Mid-Size Mill", type: "mill", locationId: "wi-greenbay", baseWeeklyCapacityUnits: 1500, equipmentLevel: 2, condition: 100, weeklyLeaseCost: 2800, weeklyUtilityBaseCost: 1100, ownedOutright: false, purchaseValue: 220000 },
      ],
      products: [
        { id: "product-1", templateId: "copy-paper", name: "Standard Copy Paper", sku: "COPY-1234", unitLabel: "case", priceWeekly: 19.25, inputUnitsPerProductUnit: 0.082, inventoryUnits: 0, fgValueMaterials: 0, fgValueLabor: 0, fgValueOverhead: 0, unitsProducedLastWeek: 0, unitsSoldLastWeek: 0 },
        // no capacityAllocationPct, no referenceMarketPrice, no unitsUnfulfilledLastWeek, no active flag -- pre-multi-product shape
      ],
      rawMaterialInventoryUnits: 12,
      employees: [],
      openPositions: [],
      customers: [
        { id: "starter-customer-0", name: "Heartland Distribution", segment: "regional-distributors", location: "Regional", annualVolumeUnits: 3000, priceSensitivity: 0.7, qualityExpectation: 0.55, paymentTermsDays: 40, relationshipStrength: 55, contractedSince: 0, lastOrderWeek: null, atRisk: false },
        // no productId -- pre-multi-product shape
      ],
      suppliers: [
        { id: "supplier-1", name: "Regional Pulp Co.", inputId: "wood-pulp", location: "Regional", pricePerUnit: 185, quality: 0.8, reliability: 0.9, paymentTermsDays: 30, leadTimeWeeks: 1, isPrimary: true },
        // no purchaseAllocationPct -- pre-multi-supplier shape
      ],
      founderAllocation: { production: 0.4, purchasing: 0.2, sales: 0.2, accounting: 0.2 },
      kpiHistory: [],
      historyLog: [{ week: 0, date: "2025-01-06", headline: "Legacy Paper Co. founded", category: "founding" }],
      ownership: { founderEquityPct: 100, stakeholders: [] },
      targetCustomerSegment: "regional-distributors",
      // no delegation, no managerDecisionLog -- pre-management-hierarchy shape
    },
    economy: { interestRateAnnual: 0.065, inflationAnnual: 0.028, demandIndex: 1, cyclePhase: "expansion", weeksInPhase: 3 },
    competitors: [],
    market: {
      regionalWeeklyDemandUnits: 10000, estimatedDemandRangeUnits: [8800, 11200], avgMarketPrice: 19.5,
      inputPricePerUnit: 185, inputPriceTrendPct: 0, priceElasticity: 1.4, unitLabel: "case", inputLabel: "pulp-ton",
    },
    pendingDecisions: [],
    lastBriefing: null,
    lastRevenueCausal: null,
    lastProfitCausal: null,
    lastEvaluations: [],
    recentEventLog: [],
    // no lastManagementSnapshot -- pre-management-hierarchy shape
  };
}

describe("legacy save migration", () => {
  it("backfills every field added since the original release without touching existing data", () => {
    const migrated = migrateGameState(legacySaveFixture());

    expect(migrated.company.name).toBe("Legacy Paper Co.");
    expect(migrated.week).toBe(3);
    expect(migrated.company.entries).toHaveLength(1);

    const product = migrated.company.products[0];
    expect(product.capacityAllocationPct).toBe(1);
    expect(product.referenceMarketPrice).toBe(19.25);
    expect(product.unitsUnfulfilledLastWeek).toBe(0);
    expect(product.active).toBe(true);

    expect(migrated.company.customers[0].productId).toBe("product-1");
    expect(migrated.company.suppliers[0].purchaseAllocationPct).toBe(1);

    expect(migrated.company.delegation.purchasing.authority).toBe("player-approval");
    expect(migrated.company.delegation.hiring.authority).toBe("player-approval");
    expect(migrated.company.managerDecisionLog).toEqual([]);
    expect(migrated.lastManagementSnapshot).toBeNull();

    // Phase 3 fields — none of these existed in the original save shape.
    const facility = migrated.company.facilities[0];
    expect(facility.role).toBe("production");
    expect(facility.ownershipType).toBe("lease");
    expect(facility.status).toBe("operating");
    expect(facility.storageCapacityUnits).toBeGreaterThan(0);
    expect(product.facilityInventory[facility.id]).toBe(0);
    expect(migrated.company.customers[0].locationId).toBe("wi-greenbay");
    expect(migrated.company.enteredMarkets).toEqual([]);
    expect(migrated.company.inTransitShipments).toEqual([]);
    expect(migrated.market.regions["wi-greenbay"]).toBeDefined();
    expect(migrated.market.regions["wi-greenbay"].weeklyDemandUnits).toBe(10000);
  });

  it("a migrated legacy save can keep simulating with a balanced ledger", () => {
    const migrated = migrateGameState(legacySaveFixture());
    for (let i = 0; i < 15; i++) {
      advanceWeek(migrated);
      const tb = trialBalance(migrated.company.entries, migrated.week);
      expect(tb.balanced, `unbalanced at week ${migrated.week}`).toBe(true);
    }
    expect(migrated.week).toBe(18);
  });
});
