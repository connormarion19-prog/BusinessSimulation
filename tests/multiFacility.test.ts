import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { balanceSheetAsOf } from "../src/engine/reports";
import { openFacilityForCompany } from "../src/engine/facilities";
import { getIndustryDefinition } from "../src/industries/registry";
import type { Employee, EmployeeTraits } from "../src/types/employee";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Multi-Site Paper Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "bank-loan",
    startingCash: 400_000,
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

describe("multi-facility operations", () => {
  it("opens a new facility with location-scaled costs and posts a balanced deposit entry", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(game.company.facilities).toHaveLength(1);

    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "or-portland", game.week, game.currentDate);
    expect(result.ok).toBe(true);
    expect(game.company.facilities).toHaveLength(2);
    game.company.entries.push(...result.entries);

    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);

    // Portland has a higher commercial rent index than the small-job-shop template's base cost.
    const secondFacility = game.company.facilities[1];
    const template = industry.facilityTemplates.find((t) => t.id === "small-job-shop")!;
    expect(secondFacility.weeklyLeaseCost).not.toBe(template.weeklyLeaseCost);
    expect(secondFacility.locationId).toBe("or-portland");
  });

  it("refuses to open a facility with an unknown template or location", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(openFacilityForCompany(game.company, industry, "not-a-real-template", "wi-greenbay", game.week, game.currentDate).ok).toBe(false);
    expect(openFacilityForCompany(game.company, industry, "small-job-shop", "not-a-real-location", game.week, game.currentDate).ok).toBe(false);
  });

  it("aggregates capacity across facilities and keeps the accounting identity intact for 25 weeks", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams({ facilityTemplateId: "small-job-shop" }));
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "tx-tyler", game.week, game.currentDate);
    game.company.entries.push(...result.entries);
    const secondFacilityId = result.facility!.id;

    // Enough labor at each site to push real utilization (a couple of workers against a small facility's
    // modest capacity), so both facilities should show measurable wear rather than idling near 100%.
    for (let i = 0; i < 4; i++) {
      game.company.employees.push(makeProductionEmployee(`pw-home-${i}`, game.company.facilities[0].id));
      game.company.employees.push(makeProductionEmployee(`pw-branch-${i}`, secondFacilityId));
    }

    for (let i = 0; i < 25; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
    }

    // Both facilities should have accumulated some wear from running production.
    const [home, branch] = game.company.facilities;
    expect(home.condition).toBeLessThan(100);
    expect(branch.condition).toBeLessThan(100);
  });

  it("a facility with no assigned labor stays idle and doesn't wear down from production", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const result = openFacilityForCompany(game.company, industry, "small-job-shop", "ga-savannah", game.week, game.currentDate);
    game.company.entries.push(...result.entries);
    const idleFacilityId = result.facility!.id;

    for (let i = 0; i < 10; i++) advanceWeek(game);

    const idleFacility = game.company.facilities.find((f) => f.id === idleFacilityId)!;
    // No labor assigned there and the founder can only work the home facility, so it should barely (if at all) decay.
    expect(idleFacility.condition).toBeGreaterThanOrEqual(97);
  });
});
