import type { Company } from "../types/core";
import type { EmployeeRoleTemplate, FounderAllocation, WorkFunction } from "../types/employee";
import { WORK_FUNCTIONS, computeFunctionSkill, computeOverallocationPenalty, totalAllocationPct } from "./performance";
import { round2 } from "./ledger";

/** The founder's own baseline skill level, used identically wherever the founder personally covers a function. */
export const FOUNDER_BASE_SKILL = 62;

/** Maps the legacy 4-field founder allocation (fractions 0-1) onto the 5 WorkFunction buckets (percent 0-100). "production" becomes "operations". */
export function founderFunctionAllocation(fa: FounderAllocation): Record<WorkFunction, number> {
  return {
    operations: fa.production * 100,
    purchasing: fa.purchasing * 100,
    sales: fa.sales * 100,
    accounting: fa.accounting * 100,
    administration: fa.administration * 100,
  };
}

function roleById(roles: EmployeeRoleTemplate[], roleId: string): EmployeeRoleTemplate | undefined {
  return roles.find((r) => r.id === roleId);
}

/**
 * How much work the company actually generates in each function this week, derived from real,
 * current company state — never a flat "level up" number. Units are "percent of one FTE"; 100
 * means exactly one full-time, fully-skilled person's worth of work.
 */
export function computeCompanyWorkload(company: Company): Record<WorkFunction, number> {
  const employeeCount = company.employees.filter((e) => e.status === "active").length;
  const facilityCount = company.facilities.filter((f) => f.status !== "closed").length;
  const supplierCount = company.suppliers.length;
  const customerCount = company.customers.length;
  const productCount = company.products.filter((p) => p.active).length;
  const loanCount = company.loans.filter((l) => l.balance > 0).length;
  const marketsActive = 1 + company.enteredMarkets.filter((m) => m.status === "active" || m.status === "entering").length;
  const weeklyProductionUnits = company.products.reduce((s, p) => s + p.unitsProducedLastWeek, 0);
  const weeklyPurchaseUnits = company.rawMaterialInventoryUnits > 0 ? company.rawMaterialInventoryUnits * 0.3 : 0;
  const equipmentSum = company.facilities.reduce((s, f) => s + f.equipmentLevel, 0);
  const pendingManagerDecisions = company.managerDecisionLog.filter((d) => d.status === "pending-approval").length;

  const accounting =
    8 + employeeCount * 1.2 + supplierCount * 3 + customerCount * 1.5 + facilityCount * 6 + loanCount * 8;
  const purchasing = 10 + supplierCount * 8 + productCount * 10 + (weeklyPurchaseUnits / 100) * 2;
  const sales = 8 + customerCount * 6 + productCount * 8 + marketsActive * 10;
  const operations = 10 + facilityCount * 10 + productCount * 8 + (weeklyProductionUnits / 100) * 1.5 + equipmentSum * 2;
  const administration = 10 + employeeCount * 2 + facilityCount * 4 + pendingManagerDecisions * 1.5;

  return {
    accounting: round2(accounting),
    purchasing: round2(purchasing),
    sales: round2(sales),
    operations: round2(operations),
    administration: round2(administration),
  };
}

export interface CapacityBreakdown {
  /** Raw declared allocation, in percent-of-FTE, regardless of skill. What the person actually committed their time to. */
  raw: Record<WorkFunction, number>;
  /** Allocation weighted by actual capability and overallocation penalty — what the company can actually count on. */
  effective: Record<WorkFunction, number>;
  perPerson: { id: string; name: string; isFounder: boolean; raw: Record<WorkFunction, number>; effective: Record<WorkFunction, number> }[];
}

function emptyFunctionRecord(): Record<WorkFunction, number> {
  return { accounting: 0, purchasing: 0, sales: 0, operations: 0, administration: 0 };
}

/**
 * Available weekly capacity, founder + every active employee, both as raw declared allocation and
 * as skill/overallocation-weighted effective capacity. This is the exact same per-person data the
 * weekly simulation reads (via computeFunctionSkill / totalAllocationPct) — the dashboard is never a
 * separate, fake calculation from what actually drives outcomes.
 */
export function computeAvailableCapacity(company: Company, roles: EmployeeRoleTemplate[]): CapacityBreakdown {
  const raw = emptyFunctionRecord();
  const effective = emptyFunctionRecord();
  const perPerson: CapacityBreakdown["perPerson"] = [];

  const founderRaw = founderFunctionAllocation(company.founderAllocation);
  const founderEffective = emptyFunctionRecord();
  for (const fn of WORK_FUNCTIONS) {
    raw[fn] += founderRaw[fn];
    // The founder is assumed reasonably capable (FOUNDER_BASE_SKILL) at everything they personally cover.
    const eff = (founderRaw[fn] / 100) * FOUNDER_BASE_SKILL;
    founderEffective[fn] = round2(eff);
    effective[fn] += eff;
  }
  perPerson.push({ id: "founder", name: "Founder", isFounder: true, raw: founderRaw, effective: founderEffective });

  for (const emp of company.employees) {
    if (emp.status !== "active") continue;
    const role = roleById(roles, emp.roleId);
    const penalty = computeOverallocationPenalty(totalAllocationPct(emp));
    const empRaw = emptyFunctionRecord();
    const empEffective = emptyFunctionRecord();
    for (const fn of WORK_FUNCTIONS) {
      const pct = emp.allocation[fn] ?? 0;
      empRaw[fn] = pct;
      raw[fn] += pct;
      const affinity = role?.functionAffinity[fn] ?? 0.3;
      const skill = computeFunctionSkill(emp, fn, affinity);
      const eff = (pct / 100) * skill * penalty;
      empEffective[fn] = round2(eff);
      effective[fn] += eff;
    }
    perPerson.push({ id: emp.id, name: emp.name, isFounder: false, raw: empRaw, effective: empEffective });
  }

  for (const fn of WORK_FUNCTIONS) {
    raw[fn] = round2(raw[fn]);
    effective[fn] = round2(effective[fn]);
  }

  return { raw, effective, perPerson };
}

export type StaffingStatus = "large-surplus" | "balanced" | "tight" | "overloaded" | "critically-overloaded";

export function classifyStaffingStatus(required: number, available: number): StaffingStatus {
  if (available <= 0) return required > 0 ? "critically-overloaded" : "balanced";
  const ratio = required / available;
  if (ratio < 0.55) return "large-surplus";
  if (ratio < 0.85) return "balanced";
  if (ratio < 1.05) return "tight";
  if (ratio < 1.4) return "overloaded";
  return "critically-overloaded";
}

export const STAFFING_STATUS_LABEL: Record<StaffingStatus, string> = {
  "large-surplus": "Large unused capacity",
  balanced: "Adequately staffed",
  tight: "Approaching capacity",
  overloaded: "Understaffed",
  "critically-overloaded": "Critically overloaded",
};

export interface StaffingGap {
  fn: WorkFunction;
  required: number;
  available: number;
  effectiveAvailable: number;
  gap: number; // required - available; positive = shortage, negative = surplus
  status: StaffingStatus;
  efficiency: number; // effectiveAvailable / required, 0-1+ ; how much of the required work capable people can actually cover
}

/** The full staffing picture for every function — the actual data the Employee Dashboard renders and the same numbers weekly.ts's capacity formulas are built from. */
export function computeStaffingGaps(company: Company, roles: EmployeeRoleTemplate[]): Record<WorkFunction, StaffingGap> {
  const workload = computeCompanyWorkload(company);
  const capacity = computeAvailableCapacity(company, roles);
  const out = {} as Record<WorkFunction, StaffingGap>;
  for (const fn of WORK_FUNCTIONS) {
    const required = workload[fn];
    const available = capacity.raw[fn];
    const effectiveAvailable = capacity.effective[fn];
    out[fn] = {
      fn,
      required,
      available,
      effectiveAvailable,
      gap: round2(required - available),
      status: classifyStaffingStatus(required, available),
      efficiency: required > 0 ? round2(effectiveAvailable / required) : 1,
    };
  }
  return out;
}

export interface HireImpactPreview {
  role: EmployeeRoleTemplate;
  capacityAdded: Record<WorkFunction, number>;
  estAnnualCostLow: number;
  estAnnualCostHigh: number;
  rationale: string[];
}

/** Non-mutating preview of what adding this role would do to the capacity picture — pure information, never a recommendation to act on. */
export function previewHireImpact(company: Company, roles: EmployeeRoleTemplate[], roleId: string): HireImpactPreview | null {
  const role = roleById(roles, roleId);
  if (!role) return null;
  const gaps = computeStaffingGaps(company, roles);
  const rationale: string[] = [];

  const dominantFn = (Object.entries(role.defaultAllocation) as [WorkFunction, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dominantFn) {
    const gap = gaps[dominantFn];
    if (gap.status === "overloaded" || gap.status === "critically-overloaded") {
      rationale.push(
        `${capitalize(dominantFn)} is currently running ${Math.round(gap.required)}% of a full-time workload against ${Math.round(gap.available)}% available — this hire's ${Math.round(role.defaultAllocation[dominantFn] ?? 0)}% ${dominantFn} allocation would directly relieve that.`,
      );
    } else if (gap.status === "large-surplus") {
      rationale.push(
        `${capitalize(dominantFn)} currently has substantial unused capacity (${Math.round(gap.required)}% required vs ${Math.round(gap.available)}% available) — this hire's time here would likely sit underused at current activity levels.`,
      );
    } else {
      rationale.push(`${capitalize(dominantFn)} is roughly balanced right now (${Math.round(gap.required)}% required vs ${Math.round(gap.available)}% available).`);
    }
  }

  const capacityAdded = emptyFunctionRecord();
  for (const fn of WORK_FUNCTIONS) {
    const pct = role.defaultAllocation[fn] ?? 0;
    if (pct <= 0) continue;
    const skill = 55 * (role.functionAffinity[fn] ?? 0.3); // assume an average-skill new hire for the preview
    capacityAdded[fn] = round2((pct / 100) * skill);
  }

  return {
    role,
    capacityAdded,
    estAnnualCostLow: role.salaryRange[0],
    estAnnualCostHigh: role.salaryRange[1],
    rationale,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
