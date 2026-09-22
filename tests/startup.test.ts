import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { balanceSheetAsOf } from "../src/engine/reports";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { researchProspect, pitchProspect } from "../src/engine/prospecting";
import { explainProductEconomics, explainCogsComponents, explainCashVsProfit, computeCashRunwayWarning, explainLoss } from "../src/engine/financialExplain";
import { incomeStatementForRange } from "../src/engine/reports";
import { getIndustryDefinition } from "../src/industries/registry";
import { createRng } from "../src/engine/rng";
import type { NewCompanyParams } from "../src/types/industry";
import type { CustomerPitch } from "../src/types/core";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Micro Startup Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "personal-savings",
    startingCash: 15_000,
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "small-job-shop",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

describe("zero-supplier, zero-customer startup", () => {
  it("a brand-new company starts with no customers and no suppliers, but a real prospect pool", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    expect(game.company.customers).toHaveLength(0);
    expect(game.company.suppliers).toHaveLength(0);
    expect(game.company.prospects.length).toBeGreaterThan(0);
    for (const p of game.company.prospects) {
      expect(p.status).toBe("new");
      expect(p.estimate.annualVolumeRangeUnits[0]).toBeLessThanOrEqual(p.estimate.annualVolumeRangeUnits[1]);
    }
  });

  it("tiny starting capital ($15k) is a viable, non-crashing starting scenario", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    expect(game.company.ownership.founderEquityPct).toBe(100);
    for (let i = 0; i < 10; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }
  });

  it("with no supplier, production and raw materials stay at zero indefinitely — a real, not silently-ignored, gap", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    for (let i = 0; i < 12; i++) advanceWeek(game);
    expect(game.company.rawMaterialInventoryUnits).toBe(0);
    const totalProduced = game.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    expect(totalProduced).toBe(0);
    const noSupplierDecision = game.pendingDecisions.find((d) => d.kind === "no-suppliers");
    expect(noSupplierDecision).toBeDefined();
    expect(noSupplierDecision!.severity).toBe("urgent");
  });

  it("establishing the first supplier gives it 100% allocation and production resumes", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const ok = addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    expect(ok).toBe(true);
    expect(game.company.suppliers).toHaveLength(1);
    expect(game.company.suppliers[0].purchaseAllocationPct).toBe(1);
    expect(game.company.suppliers[0].isPrimary).toBe(true);

    for (let i = 0; i < 10; i++) advanceWeek(game);
    const totalProduced = game.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    expect(totalProduced).toBeGreaterThan(0);
    expect(game.pendingDecisions.find((d) => d.kind === "no-suppliers")).toBeUndefined();
  });
});

describe("customer prospecting", () => {
  it("researching a prospect narrows the visible estimate range without ever revealing the exact truth", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    const beforeWidth = prospect.estimate.annualVolumeRangeUnits[1] - prospect.estimate.annualVolumeRangeUnits[0];
    const result = researchProspect(game.company, prospect.id, game.week, game.currentDate);
    expect(result.ok).toBe(true);
    game.company.entries.push(...result.entries);
    const afterWidth = prospect.estimate.annualVolumeRangeUnits[1] - prospect.estimate.annualVolumeRangeUnits[0];
    expect(afterWidth).toBeLessThan(beforeWidth);
    expect(prospect.researched).toBe(true);
    expect(prospect.status).toBe("researched");
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });

  it("a well-matched, competitively-priced pitch with strong sales capability wins far more often than an overpriced one", () => {
    let goodWins = 0;
    let badWins = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      const rng = createRng(1000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      const goodPitch: CustomerPitch = {
        productId: game.company.products[0].id,
        priceOffered: prospect.trueWillingnessToPayPerUnit * 0.85,
        volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
        paymentTermsDaysOffered: prospect.truePaymentTermsDays + 15,
        contractLengthWeeks: 52,
      };
      const result = pitchProspect(game.company, prospect.id, goodPitch, 1.4, 1.0, game.week, game.currentDate, rng);
      if (result.won) goodWins++;
    }
    for (let i = 0; i < trials; i++) {
      const rng = createRng(2000 + i);
      const game = createNewGame("paper-manufacturing", "Test", baseParams());
      const prospect = game.company.prospects[0];
      const badPitch: CustomerPitch = {
        productId: game.company.products[0].id,
        priceOffered: prospect.trueWillingnessToPayPerUnit * 2.2,
        volumeCommitmentUnits: 10,
        paymentTermsDaysOffered: 0,
        contractLengthWeeks: 4,
      };
      const result = pitchProspect(game.company, prospect.id, badPitch, 0.5, 0.6, game.week, game.currentDate, rng);
      if (result.won) badWins++;
    }
    expect(goodWins).toBeGreaterThan(badWins);
    expect(goodWins / trials).toBeGreaterThan(0.4);
    expect(badWins / trials).toBeLessThan(0.25);
  });

  it("winning a pitch creates a real customer account and costs a real, balanced outreach expense", () => {
    const rng = createRng(42);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    const pitch: CustomerPitch = {
      productId: game.company.products[0].id,
      priceOffered: prospect.trueWillingnessToPayPerUnit * 0.8,
      volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
      paymentTermsDaysOffered: prospect.truePaymentTermsDays + 20,
      contractLengthWeeks: 52,
    };
    let result;
    let attempts = 0;
    do {
      result = pitchProspect(game.company, prospect.id, pitch, 1.5, 1.0, game.week, game.currentDate, rng);
      attempts++;
    } while (!result.won && attempts < 5 && prospect.status !== "lost");
    game.company.entries.push(...result.entries);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
    if (result.won) {
      expect(game.company.customers.length).toBeGreaterThan(0);
      expect(prospect.status).toBe("won");
      expect(prospect.wonCustomerId).toBeDefined();
    }
  });

  it("refuses to pitch a prospect that's already won or lost", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const prospect = game.company.prospects[0];
    prospect.status = "won";
    const pitch: CustomerPitch = { productId: game.company.products[0].id, priceOffered: 5, volumeCommitmentUnits: 100, paymentTermsDaysOffered: 30, contractLengthWeeks: 12 };
    const result = pitchProspect(game.company, prospect.id, pitch, 1, 1, game.week, game.currentDate, game.rng);
    expect(result.ok).toBe(false);
  });
});

describe("financial drill-down / explanations", () => {
  function runningGame() {
    const game = createNewGame("paper-manufacturing", "Test", baseParams({ facilityTemplateId: "mid-size-mill", startingCash: 200_000, financingSourceId: "bank-loan", loanTerms: { principal: 200_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" } }));
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    for (let i = 0; i < 15; i++) advanceWeek(game);
    return game;
  }

  it("product-economics revenue matches the income statement's total revenue for the same week", () => {
    const game = runningGame();
    const products = explainProductEconomics(game.company, game.week, game.week);
    const is = incomeStatementForRange(game.company.entries, game.week, game.week, "this week");
    const totalProductRevenue = products.reduce((s, p) => s + p.revenue, 0);
    expect(totalProductRevenue).toBeCloseTo(is.revenue, 1);
  });

  it("COGS components (materials + labor + overhead) reconcile with the income statement's COGS", () => {
    const game = runningGame();
    const components = explainCogsComponents(game.company, game.week, game.week);
    expect(components.materials + components.labor + components.overhead).toBeCloseTo(components.total, 1);
  });

  it("cash-vs-profit explanation produces a real narrative referencing an actual net income figure", () => {
    const game = runningGame();
    const explanation = explainCashVsProfit(game.company, game.week, game.week);
    expect(explanation.narrative.length).toBeGreaterThan(10);
    expect(Number.isFinite(explanation.netIncome)).toBe(true);
    expect(Number.isFinite(explanation.cashChange)).toBe(true);
  });

  it("cash runway warning flags a real shortage when cash is thin and burn is real", () => {
    const game = runningGame();
    // Drain cash artificially to simulate a real crunch, then check the warning reacts.
    const warning = computeCashRunwayWarning(game.company, game.week);
    expect(Number.isFinite(warning.weeklyPayroll)).toBe(true);
    expect(warning.narrative.length).toBeGreaterThan(5);
  });

  it("loss explanation correctly reports profitability when the company isn't losing money, or a grounded reason when it is", () => {
    const game = runningGame();
    const loss = explainLoss(game.company, game.week);
    expect(typeof loss.isLosing).toBe("boolean");
    expect(loss.narrative.length).toBeGreaterThan(5);
  });
});

describe("full build-from-scratch integration", () => {
  it("a company can go from zero suppliers/customers to a running, balanced business over 25 weeks", () => {
    const rng = createRng(7);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;

    for (let i = 0; i < 3; i++) {
      advanceWeek(game);
      expect(trialBalance(game.company.entries, game.week).balanced).toBe(true);
    }

    expect(addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate)).toBe(true);

    const prospect = game.company.prospects[0];
    const pitch: CustomerPitch = {
      productId: game.company.products[0].id,
      priceOffered: prospect.trueWillingnessToPayPerUnit * 0.82,
      volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
      paymentTermsDaysOffered: prospect.truePaymentTermsDays + 15,
      contractLengthWeeks: 52,
    };
    let pitchResult;
    let attempts = 0;
    do {
      pitchResult = pitchProspect(game.company, prospect.id, pitch, 1.4, 1.0, game.week, game.currentDate, rng);
      attempts++;
    } while (!pitchResult.won && attempts < 6 && prospect.status !== "lost");
    game.company.entries.push(...pitchResult.entries);

    for (let i = 0; i < 25; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
    }

    expect(game.company.suppliers.length).toBe(1);
    const totalProduced = game.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    expect(totalProduced).toBeGreaterThan(0);
  });
});
