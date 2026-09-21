import type { GameState } from "../types/core";
import { defaultDelegationSettings } from "./delegation";

/**
 * Backfills fields added in later releases so saves from earlier phases of the game keep loading
 * instead of crashing on a missing field. Never drops or rewrites existing player data — only fills
 * in gaps with safe, inert defaults (e.g. "no delegation yet", "single supplier gets 100% of spend").
 */
export function migrateGameState(raw: unknown): GameState {
  const state = raw as GameState;
  const company = state.company as unknown as Record<string, unknown>;

  if (!Array.isArray(company.products)) company.products = [];
  for (const product of company.products as Record<string, unknown>[]) {
    if (typeof product.capacityAllocationPct !== "number") product.capacityAllocationPct = 1;
    if (typeof product.referenceMarketPrice !== "number") product.referenceMarketPrice = product.priceWeekly as number;
    if (typeof product.unitsUnfulfilledLastWeek !== "number") product.unitsUnfulfilledLastWeek = 0;
    if (typeof product.active !== "boolean") product.active = true;
  }

  const products = company.products as { id: string }[];
  if (!Array.isArray(company.customers)) company.customers = [];
  for (const customer of company.customers as Record<string, unknown>[]) {
    if (typeof customer.productId !== "string") customer.productId = products[0]?.id ?? "";
  }

  if (!Array.isArray(company.suppliers)) company.suppliers = [];
  const suppliers = company.suppliers as Record<string, unknown>[];
  const suppliersMissingAllocation = suppliers.filter((s) => typeof s.purchaseAllocationPct !== "number");
  if (suppliersMissingAllocation.length > 0 && suppliers.length > 0) {
    const evenShare = 1 / suppliers.length;
    for (const supplier of suppliers) supplier.purchaseAllocationPct = evenShare;
  }

  if (!Array.isArray(company.facilities)) company.facilities = [];
  const facilities = company.facilities as { id: string }[];
  if (!Array.isArray(company.employees)) company.employees = [];
  for (const employee of company.employees as Record<string, unknown>[]) {
    if (employee.facilityId === undefined) employee.facilityId = facilities[0]?.id ?? null;
    if (employee.managerId === undefined) employee.managerId = null;
  }

  if (!company.delegation) company.delegation = defaultDelegationSettings();
  if (!Array.isArray(company.managerDecisionLog)) company.managerDecisionLog = [];
  if (!company.rawMaterialInventoryUnits && company.rawMaterialInventoryUnits !== 0) company.rawMaterialInventoryUnits = 0;

  if (state.lastManagementSnapshot === undefined) state.lastManagementSnapshot = null;
  if (!Array.isArray(state.recentEventLog)) state.recentEventLog = [];
  if (!Array.isArray(state.lastEvaluations)) state.lastEvaluations = [];

  return state;
}
