import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { balanceSheetAsOf } from "../src/engine/reports";
import { getCash } from "../src/engine/company";
import { generateApplicantPool } from "../src/engine/hiring";
import { getIndustryDefinition } from "../src/industries/registry";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Test Paper Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "bank-loan",
    startingCash: 200_000,
    loanTerms: { principal: 200_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" },
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "mid-size-mill",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

describe("full simulation integrity", () => {
  it("keeps the accounting identity intact across 40 simulated weeks", () => {
    const game = createNewGame("paper-manufacturing", "Test Save", baseParams());

    for (let i = 0; i < 40; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `trial balance unbalanced at week ${game.week}`).toBe(true);

      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}: ${bs.imbalanceAmount}`).toBe(true);

      const cash = getCash(game.company, game.week);
      expect(cash).toBe(bs.assets.cash);
      expect(Number.isFinite(cash)).toBe(true);

      const snapshot = game.company.kpiHistory[game.company.kpiHistory.length - 1];
      expect(Number.isFinite(snapshot.revenue)).toBe(true);
      expect(Number.isFinite(snapshot.netIncome)).toBe(true);
      expect(Number.isFinite(snapshot.cash)).toBe(true);
    }

    expect(game.week).toBe(40);
    expect(game.company.kpiHistory).toHaveLength(40);
  });

  it("produces some production and sales activity by week 10", () => {
    const game = createNewGame("paper-manufacturing", "Test Save", baseParams());
    for (let i = 0; i < 10; i++) advanceWeek(game);
    const totalProduced = game.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    expect(totalProduced).toBeGreaterThan(0);
  });

  it("stays balanced after hiring an employee mid-simulation", () => {
    const game = createNewGame("paper-manufacturing", "Test Save", baseParams());
    for (let i = 0; i < 5; i++) advanceWeek(game);

    const industry = getIndustryDefinition("paper-manufacturing")!;
    const role = industry.employeeRoles.find((r) => r.id === "production-worker")!;
    const candidates = generateApplicantPool(role, game.rng, game.week, 3);
    const candidate = candidates[0];

    game.company.employees.push({
      id: "test-emp-1",
      name: candidate.name,
      age: candidate.age,
      location: candidate.location,
      roleId: candidate.roleId,
      title: role.title,
      department: role.department,
      hireWeek: game.week,
      salaryWeekly: candidate.askingSalaryWeekly,
      managerId: null,
      facilityId: game.company.facilities[0].id,
      traits: candidate.traits,
      education: candidate.education,
      priorEmployers: candidate.priorEmployers,
      status: "active",
      morale: 60,
      fatigue: 10,
      performanceHistory: [],
      cumulativeErrors: 0,
      cumulativeTasksCompleted: 0,
      lastRaiseWeek: null,
      onPip: false,
    });

    for (let i = 0; i < 10; i++) advanceWeek(game);

    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);

    const employee = game.company.employees.find((e) => e.id === "test-emp-1")!;
    expect(employee.performanceHistory.length).toBeGreaterThan(0);
    expect(employee.performanceHistory[0].narrative.length).toBeGreaterThan(10);
  });

  it("supports a long-horizon save (5 simulated years) without drift or NaN", () => {
    const game = createNewGame("paper-manufacturing", "Test Save", baseParams({ startingCash: 300_000, loanTerms: { principal: 300_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" } }));
    for (let i = 0; i < 260; i++) {
      advanceWeek(game);
    }
    const bs = balanceSheetAsOf(game.company.entries, game.week);
    expect(bs.balances).toBe(true);
    expect(Number.isFinite(bs.totalAssets)).toBe(true);
    expect(game.week).toBe(260);
  });
});
