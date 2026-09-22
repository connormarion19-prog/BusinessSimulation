import { describe, expect, it } from "vitest";
import { createTestGame } from "./testHelpers";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance } from "../src/engine/ledger";
import { computeManagerSpanCapacity, computeSpanOverloadFactor, directReportsOf } from "../src/engine/management";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { approveManagerDecision, rejectManagerDecision } from "../src/engine/delegation";
import { getIndustryDefinition } from "../src/industries/registry";
import type { Employee, EmployeeTraits } from "../src/types/employee";
import type { NewCompanyParams } from "../src/types/industry";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Delegation Test Co.",
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

const SKILLED_TRAITS: EmployeeTraits = {
  technicalAbility: 75, reliability: 75, attentionToDetail: 75, communication: 80,
  initiative: 80, judgment: 85, leadership: 85, learningAbility: 75, adaptability: 75, organization: 80,
};
const WEAK_TRAITS: EmployeeTraits = {
  technicalAbility: 40, reliability: 40, attentionToDetail: 40, communication: 40,
  initiative: 40, judgment: 35, leadership: 30, learningAbility: 40, adaptability: 40, organization: 35,
};

function defaultAllocationForDepartment(department: Employee["department"]): Employee["allocation"] {
  const fn = department === "purchasing" ? "purchasing" : department === "sales" ? "sales" : department === "accounting" ? "accounting" : department === "production" || department === "quality" || department === "maintenance" ? "operations" : "administration";
  return { accounting: 0, purchasing: 0, sales: 0, operations: 0, administration: 0, [fn]: 100 };
}

function makeEmployee(id: string, roleId: string, department: Employee["department"], traits: EmployeeTraits, overrides: Partial<Employee> = {}): Employee {
  return {
    id, name: `Test ${id}`, age: 40, location: "Regional", roleId, title: roleId, department,
    hireWeek: 0, salaryWeekly: 900, managerId: null, facilityId: null, traits,
    allocation: defaultAllocationForDepartment(department),
    education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
    priorEmployers: [], status: "active", morale: 60, fatigue: 10, performanceHistory: [],
    cumulativeErrors: 0, cumulativeTasksCompleted: 0, lastRaiseWeek: null, onPip: false,
    ...overrides,
  };
}

describe("manager span of control", () => {
  it("gives more skilled managers a larger effective capacity", () => {
    const skilled = makeEmployee("m1", "plant-manager", "management", SKILLED_TRAITS);
    const weak = makeEmployee("m2", "plant-manager", "management", WEAK_TRAITS);
    expect(computeManagerSpanCapacity(skilled)).toBeGreaterThan(computeManagerSpanCapacity(weak));
  });

  it("degrades the bonus factor once reports exceed capacity, and never below 0.5", () => {
    const manager = makeEmployee("m1", "plant-manager", "management", SKILLED_TRAITS);
    const capacity = computeManagerSpanCapacity(manager);
    expect(computeSpanOverloadFactor(manager, capacity)).toBe(1);
    expect(computeSpanOverloadFactor(manager, capacity + 2)).toBeLessThan(1);
    expect(computeSpanOverloadFactor(manager, capacity * 10)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("delegated purchasing", () => {
  it("does nothing while authority is player-approval (default) — manual mode is unaffected", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "discount-pulp-broker", game.week, game.currentDate);
    game.company.employees.push(makeEmployee("pm-1", "purchasing-manager", "management", SKILLED_TRAITS));
    const before = game.company.suppliers.map((s) => s.purchaseAllocationPct);

    for (let i = 0; i < 8; i++) advanceWeek(game);

    const after = game.company.suppliers.map((s) => s.purchaseAllocationPct);
    expect(after).toEqual(before);
    expect(game.company.managerDecisionLog.filter((d) => d.domain === "purchasing")).toHaveLength(0);
  });

  it("with full authority, gradually reallocates toward the better-scoring supplier and logs why", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "premium-northern-pulp", game.week, game.currentDate);
    // Make the second supplier clearly better: cheaper AND more reliable than the first.
    game.company.suppliers[0].pricePerUnit = 220;
    game.company.suppliers[0].reliability = 0.6;
    game.company.suppliers[1].pricePerUnit = 150;
    game.company.suppliers[1].reliability = 0.97;
    game.company.employees.push(makeEmployee("pm-1", "purchasing-manager", "management", SKILLED_TRAITS));
    game.company.delegation.purchasing = { authority: "full-authority", thresholdAmount: 0 };

    const initialAlloc = game.company.suppliers[1].purchaseAllocationPct;
    for (let i = 0; i < 16; i++) advanceWeek(game);
    const finalAlloc = game.company.suppliers.find((s) => s.id === game.company.suppliers[1].id)!.purchaseAllocationPct;

    expect(finalAlloc).toBeGreaterThan(initialAlloc);
    const decisions = game.company.managerDecisionLog.filter((d) => d.domain === "purchasing");
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].status).toBe("auto-approved");
    expect(decisions[0].reasoning.join(" ")).toMatch(/price|reliable/i);
  });

  it("queues a proposal for player approval instead of applying it when the shift exceeds the threshold", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "premium-northern-pulp", game.week, game.currentDate);
    game.company.suppliers[0].pricePerUnit = 220;
    game.company.suppliers[0].reliability = 0.55;
    game.company.suppliers[1].pricePerUnit = 140;
    game.company.suppliers[1].reliability = 0.98;
    game.company.employees.push(makeEmployee("pm-1", "purchasing-manager", "management", SKILLED_TRAITS));
    game.company.delegation.purchasing = { authority: "threshold", thresholdAmount: 1 }; // effectively always over threshold

    const before = game.company.suppliers.map((s) => ({ id: s.id, pct: s.purchaseAllocationPct }));
    for (let i = 0; i < 4; i++) advanceWeek(game);
    const after = game.company.suppliers.map((s) => ({ id: s.id, pct: s.purchaseAllocationPct }));
    expect(after).toEqual(before); // not applied yet

    const pending = game.company.managerDecisionLog.find((d) => d.domain === "purchasing" && d.status === "pending-approval");
    expect(pending).toBeDefined();

    const approved = approveManagerDecision(game.company, industry.employeeRoles, pending!.id, game.week, game.currentDate);
    expect(approved).toBe(true);
    const postApproval = game.company.suppliers.map((s) => s.purchaseAllocationPct);
    expect(postApproval).not.toEqual(before.map((b) => b.pct));
  });
});

describe("delegated hiring", () => {
  it("does nothing while authority is player-approval (default) — manual hiring flow is unaffected", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    game.company.employees.push(makeEmployee("sm-1", "sales-manager", "management", SKILLED_TRAITS));
    const role = industry.employeeRoles.find((r) => r.id === "sales-rep")!;
    game.company.openPositions.push({
      id: "opening-1", roleId: "sales-rep", title: role.title, department: "sales",
      salaryRangeMin: role.salaryRange[0] / 52, salaryRangeMax: role.salaryRange[1] / 52,
      postedWeek: 0, status: "open",
      candidates: [{
        id: "cand-1", name: "Test Candidate", age: 30, location: "Regional", roleId: "sales-rep",
        askingSalaryWeekly: 900, education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
        priorEmployers: [], resumeSummary: "test", traits: SKILLED_TRAITS, interviewNotes: {},
        availableFromWeek: 1, appliedWeek: 0,
      }],
    });

    for (let i = 0; i < 5; i++) advanceWeek(game);
    expect(game.company.openPositions[0].status).toBe("open");
    expect(game.company.employees.some((e) => e.id !== "sm-1")).toBe(false);
  });

  it("with full authority, the department manager fills the opening and logs why", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    game.company.employees.push(makeEmployee("sm-1", "sales-manager", "management", SKILLED_TRAITS));
    const role = industry.employeeRoles.find((r) => r.id === "sales-rep")!;
    game.company.openPositions.push({
      id: "opening-1", roleId: "sales-rep", title: role.title, department: "sales",
      salaryRangeMin: role.salaryRange[0] / 52, salaryRangeMax: role.salaryRange[1] / 52,
      postedWeek: game.week, status: "open",
      candidates: [
        {
          id: "cand-weak", name: "Weak Candidate", age: 30, location: "Regional", roleId: "sales-rep",
          askingSalaryWeekly: 800, education: { degree: "Associate's Degree", field: "General Studies", school: "Community College" },
          priorEmployers: [], resumeSummary: "test", traits: WEAK_TRAITS, interviewNotes: {},
          availableFromWeek: 1, appliedWeek: game.week,
        },
        {
          id: "cand-strong", name: "Strong Candidate", age: 35, location: "Regional", roleId: "sales-rep",
          askingSalaryWeekly: 950, education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
          priorEmployers: [], resumeSummary: "test", traits: SKILLED_TRAITS, interviewNotes: {},
          availableFromWeek: 1, appliedWeek: game.week,
        },
      ],
    });
    game.company.delegation.hiring = { authority: "full-authority", thresholdAmount: 0 };

    for (let i = 0; i < 3; i++) advanceWeek(game);

    expect(game.company.openPositions[0].status).toBe("filled");
    const hired = game.company.employees.find((e) => e.roleId === "sales-rep");
    expect(hired).toBeDefined();
    expect(hired!.managerId).toBe("sm-1");

    const decisions = game.company.managerDecisionLog.filter((d) => d.domain === "hiring");
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].status).toBe("auto-approved");
  });

  it("queues the hire for approval when the salary exceeds the manager's threshold, and rejection leaves the opening open", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    game.company.employees.push(makeEmployee("sm-1", "sales-manager", "management", SKILLED_TRAITS));
    const role = industry.employeeRoles.find((r) => r.id === "sales-rep")!;
    game.company.openPositions.push({
      id: "opening-1", roleId: "sales-rep", title: role.title, department: "sales",
      salaryRangeMin: role.salaryRange[0] / 52, salaryRangeMax: role.salaryRange[1] / 52,
      postedWeek: game.week, status: "open",
      candidates: [{
        id: "cand-1", name: "Test Candidate", age: 30, location: "Regional", roleId: "sales-rep",
        askingSalaryWeekly: 2000, education: { degree: "Bachelor's Degree", field: "Business", school: "State University" },
        priorEmployers: [], resumeSummary: "test", traits: SKILLED_TRAITS, interviewNotes: {},
        availableFromWeek: 1, appliedWeek: game.week,
      }],
    });
    game.company.delegation.hiring = { authority: "threshold", thresholdAmount: 1 };

    for (let i = 0; i < 3; i++) advanceWeek(game);
    expect(game.company.openPositions[0].status).toBe("open");

    const pending = game.company.managerDecisionLog.find((d) => d.domain === "hiring" && d.status === "pending-approval");
    expect(pending).toBeDefined();

    const rejected = rejectManagerDecision(game.company, pending!.id);
    expect(rejected).toBe(true);
    expect(game.company.openPositions[0].status).toBe("open");
    expect(game.company.employees.some((e) => e.roleId === "sales-rep")).toBe(false);
  });
});

describe("delegation stays balanced over a long run", () => {
  it("keeps the accounting identity intact with both domains on full authority for 26 weeks", () => {
    const game = createTestGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "discount-pulp-broker", game.week, game.currentDate);
    game.company.employees.push(makeEmployee("pm-1", "purchasing-manager", "management", SKILLED_TRAITS));
    game.company.employees.push(makeEmployee("sm-1", "sales-manager", "management", SKILLED_TRAITS));
    game.company.delegation.purchasing = { authority: "full-authority", thresholdAmount: 0 };
    game.company.delegation.hiring = { authority: "full-authority", thresholdAmount: 0 };

    for (let i = 0; i < 26; i++) {
      advanceWeek(game);
      const tb = trialBalance(game.company.entries, game.week);
      expect(tb.balanced, `unbalanced at week ${game.week}`).toBe(true);
    }
    expect(directReportsOf(game.company, "pm-1")).toBeDefined();
  });
});
