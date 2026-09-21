import type { Company, ProductLine } from "../types/core";
import { accountBalance } from "./ledger";
import { round2 } from "./ledger";

export function getCash(company: Company, throughWeek: number): number {
  return accountBalance(company.entries, "cash", throughWeek);
}

export function productAvgUnitCost(product: ProductLine): number {
  if (product.inventoryUnits <= 0) return 0;
  return round2((product.fgValueMaterials + product.fgValueLabor + product.fgValueOverhead) / product.inventoryUnits);
}

export function productCostBreakdownPct(product: ProductLine): { materials: number; labor: number; overhead: number } {
  const total = product.fgValueMaterials + product.fgValueLabor + product.fgValueOverhead;
  if (total <= 0) return { materials: 0, labor: 0, overhead: 0 };
  return {
    materials: product.fgValueMaterials / total,
    labor: product.fgValueLabor / total,
    overhead: product.fgValueOverhead / total,
  };
}

export function activeEmployeesInDepartment(company: Company, department: string): number {
  return company.employees.filter((e) => e.status === "active" && e.department === department).length;
}

export function isDepartmentDelegated(company: Company, department: string): boolean {
  return activeEmployeesInDepartment(company, department) > 0;
}

export function weeklyPayrollTotal(company: Company): number {
  return round2(
    company.employees.filter((e) => e.status === "active").reduce((sum, e) => sum + e.salaryWeekly, 0),
  );
}
