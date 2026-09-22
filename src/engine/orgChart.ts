import type { Company } from "../types/core";
import type { Department, EmployeeRoleTemplate, WorkFunction } from "../types/employee";
import { computeStaffingGaps } from "./workload";

export interface OrgTreeNode {
  id: string;
  name: string;
  title: string;
  isFounder: boolean;
  isVacancy: boolean;
  overloaded: boolean;
  children: OrgTreeNode[];
}

const FUNCTION_TO_DEPARTMENT: Record<WorkFunction, Department | null> = {
  accounting: "accounting",
  purchasing: "purchasing",
  sales: "sales",
  operations: "production",
  administration: null,
};

const FUNCTION_MANAGER_TITLE: Record<WorkFunction, string> = {
  accounting: "Controller",
  purchasing: "Purchasing Manager",
  sales: "Sales Manager",
  operations: "Plant Manager",
  administration: "Operations Associate",
};

/**
 * Builds the organization as a real tree from actual reporting relationships (Employee.managerId),
 * rooted at the founder — plus vacancy nodes for functions genuinely overloaded with nobody managing
 * them, derived from the same staffing-gap data the Employee dashboard shows. Never a decorative
 * static diagram.
 */
export function buildOrgTree(company: Company, roles: EmployeeRoleTemplate[]): OrgTreeNode {
  function childrenOf(managerId: string | null): OrgTreeNode[] {
    return company.employees
      .filter((e) => e.status === "active" && e.managerId === managerId)
      .map((e) => ({
        id: e.id,
        name: e.name,
        title: e.title,
        isFounder: false,
        isVacancy: false,
        overloaded: false,
        children: childrenOf(e.id),
      }));
  }

  const founderChildren = childrenOf(null);

  const gaps = computeStaffingGaps(company, roles);
  for (const fn of Object.keys(FUNCTION_TO_DEPARTMENT) as WorkFunction[]) {
    const gap = gaps[fn];
    if (gap.status !== "overloaded" && gap.status !== "critically-overloaded") continue;
    const department = FUNCTION_TO_DEPARTMENT[fn];
    const hasManager = department
      ? company.employees.some(
          (e) => e.status === "active" && e.department === "management" && roles.find((r) => r.id === e.roleId)?.managesDepartment === department,
        )
      : false;
    if (hasManager) continue;
    founderChildren.push({
      id: `vacancy-${fn}`,
      name: `[OPEN] ${FUNCTION_MANAGER_TITLE[fn]}`,
      title: `${fn} is overloaded — no one owns it`,
      isFounder: false,
      isVacancy: true,
      overloaded: true,
      children: [],
    });
  }

  return {
    id: "founder",
    name: "Founder",
    title: "Owner",
    isFounder: true,
    isVacancy: false,
    overloaded: false,
    children: founderChildren,
  };
}
