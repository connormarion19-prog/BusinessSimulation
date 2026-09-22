import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { computeManagementCapacity, computeManagementLoad, computeManagementSnapshot, promoteEmployeeToManager } from "../src/engine/management";
import { getIndustryDefinition } from "../src/industries/registry";
import type { Company } from "../src/types/core";
import type { Employee, EmployeeTraits } from "../src/types/employee";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Hierarchy Test Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "bank-loan",
    startingCash: 300_000,
    loanTerms: { principal: 300_000, annualRate: 0.084, termWeeks: 364, lender: "Test Bank" },
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "mid-size-mill",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

const NEUTRAL_TRAITS: EmployeeTraits = {
  technicalAbility: 60,
  reliability: 60,
  attentionToDetail: 60,
  communication: 60,
  initiative: 60,
  judgment: 60,
  leadership: 60,
  learningAbility: 60,
  adaptability: 60,
  organization: 60,
};

function defaultAllocationForDepartment(department: Employee["department"]): Employee["allocation"] {
  const fn = department === "purchasing" ? "purchasing" : department === "sales" ? "sales" : department === "accounting" ? "accounting" : department === "production" || department === "quality" || department === "maintenance" ? "operations" : "administration";
  return { accounting: 0, purchasing: 0, sales: 0, operations: 0, administration: 0, [fn]: 100 };
}

function makeEmployee(company: Company, id: string, roleId: string, department: Employee["department"], overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name: `Test ${id}`,
    age: 35,
    location: "Regional",
    roleId,
    title: roleId,
    department,
    hireWeek: 0,
    salaryWeekly: 800,
    managerId: null,
    facilityId: company.facilities[0]?.id ?? null,
    allocation: defaultAllocationForDepartment(department),
    traits: { ...NEUTRAL_TRAITS },
    education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
    priorEmployers: [],
    status: "active",
    morale: 60,
    fatigue: 10,
    performanceHistory: [],
    cumulativeErrors: 0,
    cumulativeTasksCompleted: 0,
    lastRaiseWeek: null,
    onPip: false,
    ...overrides,
  };
}

describe("management load and founder effectiveness (pure formulas)", () => {
  it("increases load with headcount/facilities/products and stays deterministic", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const baseline = computeManagementLoad(game.company);

    for (let i = 0; i < 10; i++) {
      game.company.employees.push(makeEmployee(game.company, `emp-${i}`, "production-worker", "production"));
    }
    const withEmployees = computeManagementLoad(game.company);
    expect(withEmployees).toBeGreaterThan(baseline);

    // Pure function of company state — calling it twice with no changes must return the same number.
    expect(computeManagementLoad(game.company)).toBe(withEmployees);
  });

  it("founder effectiveness degrades as the company outgrows what one person can run, and floors at 0.35", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const snapshotSmall = computeManagementSnapshot(game.company, game.week);
    expect(snapshotSmall.founderEffectiveness).toBe(1);

    for (let i = 0; i < 40; i++) {
      game.company.employees.push(makeEmployee(game.company, `emp-${i}`, "production-worker", "production"));
    }
    const snapshotLarge = computeManagementSnapshot(game.company, game.week);
    expect(snapshotLarge.founderEffectiveness).toBeLessThan(1);
    expect(snapshotLarge.founderEffectiveness).toBeGreaterThanOrEqual(0.35);
    expect(snapshotLarge.managementLoad).toBeGreaterThan(snapshotSmall.managementLoad);
  });

  it("promoting a manager increases management capacity and improves founder effectiveness", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    for (let i = 0; i < 30; i++) {
      game.company.employees.push(makeEmployee(game.company, `emp-${i}`, "production-worker", "production"));
    }
    const before = computeManagementSnapshot(game.company, game.week);
    const capacityBefore = computeManagementCapacity(game.company);

    const industry = getIndustryDefinition("paper-manufacturing")!;
    const plantManagerRole = industry.employeeRoles.find((r) => r.id === "plant-manager")!;
    const promoted = promoteEmployeeToManager(game.company, "emp-0", plantManagerRole, game.week, game.currentDate);
    expect(promoted).toBe(true);

    const capacityAfter = computeManagementCapacity(game.company);
    const after = computeManagementSnapshot(game.company, game.week);
    expect(capacityAfter).toBeGreaterThan(capacityBefore);
    expect(after.founderEffectiveness).toBeGreaterThanOrEqual(before.founderEffectiveness);
    expect(after.managerCount).toBe(1);

    // The 29 other unmanaged production employees should now report to the new plant manager.
    const reports = game.company.employees.filter((e) => e.managerId === "emp-0");
    expect(reports.length).toBe(29);
  });

  it("refuses to promote into a role that doesn't manage the employee's own department", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    game.company.employees.push(makeEmployee(game.company, "sales-1", "sales-rep", "sales"));
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const plantManagerRole = industry.employeeRoles.find((r) => r.id === "plant-manager")!;
    // A sales rep can't become plant manager (wrong department).
    expect(promoteEmployeeToManager(game.company, "sales-1", plantManagerRole, game.week, game.currentDate)).toBe(false);

    const salesManagerRole = industry.employeeRoles.find((r) => r.id === "sales-manager")!;
    expect(promoteEmployeeToManager(game.company, "sales-1", salesManagerRole, game.week, game.currentDate)).toBe(true);
    const promotedEmployee = game.company.employees.find((e) => e.id === "sales-1")!;
    expect(promotedEmployee.roleId).toBe("sales-manager");
    expect(promotedEmployee.department).toBe("management");
  });
});

describe("management hierarchy inside the weekly simulation", () => {
  it("keeps the accounting identity intact with a full management hierarchy running for 20 weeks", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    game.company.employees.push(makeEmployee(game.company, "pw-1", "production-worker", "production", { managerId: "pm-1" }));
    game.company.employees.push(makeEmployee(game.company, "pw-2", "production-worker", "production", { managerId: "pm-1" }));
    game.company.employees.push(makeEmployee(game.company, "sales-1", "sales-rep", "sales"));
    game.company.employees.push(makeEmployee(game.company, "pm-1", "plant-manager", "management"));

    for (let i = 0; i < 20; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }

    expect(game.lastManagementSnapshot).not.toBeNull();
    expect(game.lastManagementSnapshot!.managerCount).toBe(1);

    const manager = game.company.employees.find((e) => e.id === "pm-1")!;
    expect(manager.performanceHistory.length).toBeGreaterThan(0);
    expect(manager.performanceHistory[manager.performanceHistory.length - 1].narrative).toMatch(/direct report/i);
  });
});
