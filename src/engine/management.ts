import type { Company, ManagementSnapshot } from "../types/core";
import type { Department, Employee, EmployeeRoleTemplate } from "../types/employee";

const FOUNDER_MANAGEMENT_BASELINE = 9;
const MANAGER_BASE_CAPACITY = 11;

function managerSkillFactor(employee: Employee): number {
  const avg = (employee.traits.leadership + employee.traits.judgment + employee.traits.organization) / 3;
  return Math.max(0.55, Math.min(1.35, avg / 60));
}

/** How much day-to-day management the company currently requires, from its own scale — headcount, facilities, active product lines, and accounts on the books. */
export function computeManagementLoad(company: Company): number {
  const activeEmployees = company.employees.filter((e) => e.status === "active" && e.department !== "management").length;
  const managers = company.employees.filter((e) => e.status === "active" && e.department === "management").length;
  const activeProducts = company.products.filter((p) => p.active).length;
  return (
    activeEmployees * 1.0 +
    managers * 0.6 +
    company.facilities.length * 4 +
    activeProducts * 1.5 +
    company.customers.length * 0.15 +
    company.suppliers.length * 0.5
  );
}

/** How much of that load the founder plus any promoted/hired managers can actually absorb. */
export function computeManagementCapacity(company: Company): number {
  const managers = company.employees.filter((e) => e.status === "active" && e.department === "management");
  const managerCapacity = managers.reduce((sum, m) => sum + MANAGER_BASE_CAPACITY * managerSkillFactor(m), 0);
  return FOUNDER_MANAGEMENT_BASELINE + managerCapacity;
}

export function computeManagementSnapshot(company: Company, week: number): ManagementSnapshot {
  const managementLoad = computeManagementLoad(company);
  const managementCapacity = computeManagementCapacity(company);
  const founderEffectiveness = Math.max(0.35, Math.min(1, managementCapacity / Math.max(1, managementLoad)));
  const managerCount = company.employees.filter((e) => e.status === "active" && e.department === "management").length;
  return { week, managementLoad, managementCapacity, founderEffectiveness, managerCount };
}

/** Employees in this department without an assigned manager start reporting to the new manager. */
export function assignUnmanagedReports(company: Company, managerId: string, department: Department): number {
  let assigned = 0;
  for (const emp of company.employees) {
    if (emp.id === managerId) continue;
    if (emp.status !== "active") continue;
    if (emp.department !== department) continue;
    if (emp.managerId !== null) continue;
    emp.managerId = managerId;
    assigned += 1;
  }
  return assigned;
}

/**
 * Promotes an existing individual contributor into the manager role for their department (e.g.
 * production-worker -> plant-manager). Requires the target role to be a tier-2+ role in the same
 * department. Reassigns other unmanaged employees in that department to report to them.
 */
export function promoteEmployeeToManager(
  company: Company,
  employeeId: string,
  managerRole: EmployeeRoleTemplate,
  week: number,
  date: string,
): boolean {
  const employee = company.employees.find((e) => e.id === employeeId && e.status === "active");
  if (!employee) return false;
  if (managerRole.tier < 2 || !managerRole.managesDepartment) return false;
  if (managerRole.managesDepartment !== employee.department) return false;
  if (employee.roleId === managerRole.id) return false;

  const oldTitle = employee.title;
  const managedDepartment = managerRole.managesDepartment;
  employee.roleId = managerRole.id;
  employee.title = managerRole.title;
  employee.department = managerRole.department;
  employee.managerId = null;
  const reportCount = assignUnmanagedReports(company, employee.id, managedDepartment);

  company.historyLog.push({
    week,
    date,
    headline: `${employee.name} promoted from ${oldTitle} to ${managerRole.title}`,
    detail: reportCount > 0 ? `${reportCount} previously unmanaged ${managedDepartment} employee(s) now report to them.` : undefined,
    category: "hiring",
  });
  return true;
}
