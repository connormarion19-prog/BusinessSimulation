import { describe, expect, it } from "vitest";
import { createTestGame, makeTestCustomer } from "./testHelpers";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { getIndustryDefinition } from "../src/industries/registry";
import { promoteEmployeeToManager } from "../src/engine/management";
import {
  computeCompanyWorkload,
  computeAvailableCapacity,
  computeStaffingGaps,
  classifyStaffingStatus,
  previewHireImpact,
  founderFunctionAllocation,
} from "../src/engine/workload";
import { computeFunctionSkill, computeOverallocationPenalty, totalAllocationPct, computeWeeklyPerformance } from "../src/engine/performance";
import { createRng } from "../src/engine/rng";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { addProductToCompany } from "../src/engine/products";
import type { Employee, EmployeeTraits } from "../src/types/employee";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Workload Test Co.",
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
  technicalAbility: 60, reliability: 60, attentionToDetail: 60, communication: 60,
  initiative: 60, judgment: 60, leadership: 60, learningAbility: 60, adaptability: 60, organization: 60,
};

function makeEmployee(id: string, roleId: string, department: Employee["department"], allocation: Employee["allocation"], overrides: Partial<Employee> = {}): Employee {
  return {
    id, name: `Test ${id}`, age: 35, location: "Regional", roleId, title: roleId, department,
    hireWeek: 0, salaryWeekly: 800, managerId: null, facilityId: null,
    allocation,
    traits: { ...NEUTRAL_TRAITS },
    education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
    priorEmployers: [], status: "active", morale: 60, fatigue: 10, performanceHistory: [],
    cumulativeErrors: 0, cumulativeTasksCompleted: 0, lastRaiseWeek: null, onPip: false,
    ...overrides,
  };
}

describe("company workload model", () => {
  it("scales up as the company grows (more employees/facilities/products/customers/suppliers)", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const tinyWorkload = computeCompanyWorkload(game.company);

    addSupplierToCompany(game.company, industry, "premium-northern-pulp", game.week, game.currentDate);
    addProductToCompany(game.company, industry, "kraft-packaging", game.week, game.currentDate, game.rng);
    for (let i = 0; i < 8; i++) {
      game.company.employees.push(makeEmployee(`e${i}`, "production-worker", "production", { accounting: 0, purchasing: 0, sales: 0, operations: 100, administration: 0 }));
    }
    for (let i = 0; i < 6; i++) {
      game.company.customers.push(makeTestCustomer({
        id: `cust-${i}`, name: `Customer ${i}`, productId: game.company.products[0].id,
        locationId: game.company.locationId,
      }));
    }

    const grownWorkload = computeCompanyWorkload(game.company);
    expect(grownWorkload.accounting).toBeGreaterThan(tinyWorkload.accounting);
    expect(grownWorkload.purchasing).toBeGreaterThan(tinyWorkload.purchasing);
    expect(grownWorkload.sales).toBeGreaterThan(tinyWorkload.sales);
    expect(grownWorkload.administration).toBeGreaterThan(tinyWorkload.administration);
  });

  it("is deterministic — same company state always produces the same workload", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const a = computeCompanyWorkload(game.company);
    const b = computeCompanyWorkload(game.company);
    expect(a).toEqual(b);
  });
});

describe("capacity and staffing gaps", () => {
  it("counts the founder's declared allocation as available capacity when there are no employees", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const capacity = computeAvailableCapacity(game.company, industry.employeeRoles);
    const founderAlloc = founderFunctionAllocation(game.company.founderAllocation);
    expect(capacity.raw.operations).toBeCloseTo(founderAlloc.operations, 5);
    expect(capacity.raw.accounting).toBeCloseTo(founderAlloc.accounting, 5);
  });

  it("hiring an employee adds their raw allocation on top of the founder's", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const before = computeAvailableCapacity(game.company, industry.employeeRoles);
    game.company.employees.push(makeEmployee("e1", "bookkeeper", "accounting", { accounting: 100, purchasing: 0, sales: 0, operations: 0, administration: 0 }));
    const after = computeAvailableCapacity(game.company, industry.employeeRoles);
    expect(after.raw.accounting).toBeCloseTo(before.raw.accounting + 100, 5);
  });

  it("firing (terminating) an employee removes their capacity", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const emp = makeEmployee("e1", "bookkeeper", "accounting", { accounting: 100, purchasing: 0, sales: 0, operations: 0, administration: 0 });
    game.company.employees.push(emp);
    const withEmployee = computeAvailableCapacity(game.company, industry.employeeRoles);
    emp.status = "terminated";
    const withoutEmployee = computeAvailableCapacity(game.company, industry.employeeRoles);
    expect(withoutEmployee.raw.accounting).toBeCloseTo(withEmployee.raw.accounting - 100, 5);
  });

  it("classifies staffing status from required-vs-available ratio", () => {
    expect(classifyStaffingStatus(30, 100)).toBe("large-surplus");
    expect(classifyStaffingStatus(70, 100)).toBe("balanced");
    expect(classifyStaffingStatus(95, 100)).toBe("tight");
    expect(classifyStaffingStatus(120, 100)).toBe("overloaded");
    expect(classifyStaffingStatus(200, 100)).toBe("critically-overloaded");
    expect(classifyStaffingStatus(0, 0)).toBe("balanced");
    expect(classifyStaffingStatus(10, 0)).toBe("critically-overloaded");
  });

  it("computes a real gap (required - available) per function from actual company state", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const gaps = computeStaffingGaps(game.company, industry.employeeRoles);
    for (const fn of ["accounting", "purchasing", "sales", "operations", "administration"] as const) {
      expect(gaps[fn].gap).toBeCloseTo(gaps[fn].required - gaps[fn].available, 5);
      expect(gaps[fn].status).toBeTruthy();
    }
  });
});

describe("generalist vs specialist capability profiles", () => {
  it("a specialist has high affinity in their function and low affinity elsewhere", () => {
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const bookkeeper = industry.employeeRoles.find((r) => r.id === "bookkeeper")!;
    expect(bookkeeper.roleClass).toBe("specialist");
    expect(bookkeeper.functionAffinity.accounting).toBeGreaterThan(bookkeeper.functionAffinity.sales);
    expect(bookkeeper.functionAffinity.accounting).toBeGreaterThan(bookkeeper.functionAffinity.operations);
  });

  it("a generalist has moderate affinity spread across multiple functions", () => {
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const generalist = industry.employeeRoles.find((r) => r.id === "business-generalist")!;
    expect(generalist.roleClass).toBe("generalist");
    const values = Object.values(generalist.functionAffinity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A generalist's weakest function shouldn't be dramatically weaker than its strongest — that's the whole point.
    expect(max - min).toBeLessThan(0.3);
    // But still moderate, not a pure specialist's spike.
    expect(max).toBeLessThan(1.0);
  });

  it("the same underlying skill produces different computeFunctionSkill values depending on role affinity", () => {
    const emp = makeEmployee("e1", "bookkeeper", "accounting", { accounting: 100, purchasing: 0, sales: 0, operations: 0, administration: 0 });
    const accountingSkill = computeFunctionSkill(emp, "accounting", 1.2);
    const salesSkill = computeFunctionSkill(emp, "sales", 0.15);
    expect(accountingSkill).toBeGreaterThan(salesSkill);
  });
});

describe("overallocation", () => {
  it("applies no penalty at or under 100% allocated", () => {
    expect(computeOverallocationPenalty(100)).toBe(1);
    expect(computeOverallocationPenalty(60)).toBe(1);
  });

  it("degrades the penalty factor the further over 100% an employee is committed", () => {
    const at120 = computeOverallocationPenalty(120);
    const at160 = computeOverallocationPenalty(160);
    expect(at120).toBeLessThan(1);
    expect(at160).toBeLessThan(at120);
  });

  it("sums an employee's allocation across every function", () => {
    const emp = makeEmployee("e1", "business-generalist", "administration", { accounting: 30, purchasing: 20, sales: 40, operations: 30, administration: 20 });
    expect(totalAllocationPct(emp)).toBe(140);
  });

  it("an overallocated employee measurably underperforms an identical, properly-allocated one", () => {
    const rng = createRng(42);
    const normal = makeEmployee("e1", "bookkeeper", "accounting", { accounting: 100, purchasing: 0, sales: 0, operations: 0, administration: 0 });
    const overloaded = makeEmployee("e2", "bookkeeper", "accounting", { accounting: 60, purchasing: 40, sales: 30, operations: 20, administration: 10 });
    const normalPerf = computeWeeklyPerformance(normal, 10, rng);
    const overloadedPerf = computeWeeklyPerformance(overloaded, 10, rng);
    expect(overloadedPerf.outputFactor).toBeLessThan(normalPerf.outputFactor);
    expect(overloadedPerf.errorRate).toBeGreaterThan(normalPerf.errorRate);
  });
});

describe("founder capacity integration", () => {
  it("maps founder production allocation onto the operations work function", () => {
    const fa = { production: 0.4, purchasing: 0.2, sales: 0.15, accounting: 0.15, administration: 0.1 };
    const mapped = founderFunctionAllocation(fa);
    expect(mapped.operations).toBeCloseTo(40, 5);
    expect(mapped.purchasing).toBeCloseTo(20, 5);
    expect(mapped.administration).toBeCloseTo(10, 5);
  });
});

describe("hiring impact preview", () => {
  it("a generalist's preview spreads capacity across several functions", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const preview = previewHireImpact(game.company, industry.employeeRoles, "business-generalist")!;
    const functionsWithCapacity = Object.values(preview.capacityAdded).filter((v) => v > 0).length;
    expect(functionsWithCapacity).toBeGreaterThanOrEqual(4);
  });

  it("a specialist's preview concentrates capacity in one function", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const preview = previewHireImpact(game.company, industry.employeeRoles, "bookkeeper")!;
    const total = Object.values(preview.capacityAdded).reduce((s, v) => s + v, 0);
    expect(preview.capacityAdded.accounting / total).toBeGreaterThan(0.85);
  });

  it("returns null for an unknown role", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    expect(previewHireImpact(game.company, industry.employeeRoles, "not-a-real-role")).toBeNull();
  });
});

describe("promotion effects on allocation", () => {
  it("promoting an employee resets their allocation to the new manager role's default", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const worker = makeEmployee("w1", "production-worker", "production", { accounting: 0, purchasing: 0, sales: 0, operations: 100, administration: 0 });
    game.company.employees.push(worker);
    const plantManagerRole = industry.employeeRoles.find((r) => r.id === "plant-manager")!;
    expect(promoteEmployeeToManager(game.company, "w1", plantManagerRole, game.week, game.currentDate)).toBe(true);
    expect(worker.allocation).toEqual(plantManagerRole.defaultAllocation);
    expect(worker.allocation.administration).toBeGreaterThan(0);
  });
});

describe("staffing changes actually affect the weekly simulation", () => {
  it("hiring a business generalist changes company capacity and long-run outcomes stay balanced for 30 weeks", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const before = computeAvailableCapacity(game.company, industry.employeeRoles);

    const role = industry.employeeRoles.find((r) => r.id === "business-generalist")!;
    game.company.employees.push(
      makeEmployee("gen-1", role.id, role.department, { ...role.defaultAllocation }, { salaryWeekly: 750 }),
    );
    const after = computeAvailableCapacity(game.company, industry.employeeRoles);
    expect(after.raw.sales).toBeGreaterThan(before.raw.sales);
    expect(after.raw.purchasing).toBeGreaterThan(before.raw.purchasing);
    expect(after.raw.operations).toBeGreaterThan(before.raw.operations);

    for (let i = 0; i < 30; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }
  });

  it("reallocating an employee's time changes what they actually contribute to the simulation", () => {
    const gameA = createTestGame("paper-manufacturing", "Test", baseParams());
    const gameB = createTestGame("paper-manufacturing", "Test", baseParams());
    // Same seed-independent setup: give both an identical generalist, but allocate very differently.
    const industry = getIndustryDefinition("paper-manufacturing")!;
    const role = industry.employeeRoles.find((r) => r.id === "sales-operations-associate")!;

    const empA = makeEmployee("a1", role.id, role.department, { accounting: 0, purchasing: 0, sales: 90, operations: 10, administration: 0 });
    const empB = makeEmployee("a1", role.id, role.department, { accounting: 0, purchasing: 0, sales: 10, operations: 90, administration: 0 });
    gameA.company.employees.push(empA);
    gameB.company.employees.push(empB);

    for (let i = 0; i < 15; i++) {
      advanceWeek(gameA);
      advanceWeek(gameB);
    }

    // Heavily sales-allocated should sell relatively more vs. produce relatively more for the ops-heavy twin.
    const soldA = gameA.company.kpiHistory.reduce((s, k) => s + k.unitsSold, 0);
    const soldB = gameB.company.kpiHistory.reduce((s, k) => s + k.unitsSold, 0);
    const producedA = gameA.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    const producedB = gameB.company.kpiHistory.reduce((s, k) => s + k.unitsProduced, 0);
    expect(producedB).toBeGreaterThan(producedA);
    expect(soldA + producedA).not.toEqual(soldB + producedB);
  });
});
