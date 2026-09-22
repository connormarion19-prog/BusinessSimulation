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

  if (!Array.isArray(company.facilities)) company.facilities = [];
  const facilities = company.facilities as Record<string, unknown>[];
  for (const facility of facilities) {
    if (typeof facility.role !== "string") facility.role = facility.baseWeeklyCapacityUnits === 0 ? "distribution" : "production";
    if (typeof facility.storageCapacityUnits !== "number") facility.storageCapacityUnits = Math.max(2000, (facility.baseWeeklyCapacityUnits as number) * 6);
    if (typeof facility.ownershipType !== "string") facility.ownershipType = facility.ownedOutright ? "purchase" : "lease";
    if (typeof facility.status !== "string") facility.status = "operating";
    if (facility.constructionCompleteWeek === undefined) facility.constructionCompleteWeek = null;
    if (typeof facility.openedWeek !== "number") facility.openedWeek = (company.foundedWeek as number) ?? 1;
  }

  if (!Array.isArray(company.products)) company.products = [];
  for (const product of company.products as Record<string, unknown>[]) {
    if (typeof product.capacityAllocationPct !== "number") product.capacityAllocationPct = 1;
    if (typeof product.referenceMarketPrice !== "number") product.referenceMarketPrice = product.priceWeekly as number;
    if (typeof product.unitsUnfulfilledLastWeek !== "number") product.unitsUnfulfilledLastWeek = 0;
    if (typeof product.active !== "boolean") product.active = true;
    if (!product.facilityInventory || typeof product.facilityInventory !== "object") {
      const inventoryUnits = (product.inventoryUnits as number) ?? 0;
      if (facilities.length > 0) {
        const bucket: Record<string, number> = {};
        for (const f of facilities) bucket[f.id as string] = 0;
        bucket[facilities[0].id as string] = inventoryUnits;
        product.facilityInventory = bucket;
      } else {
        product.facilityInventory = {};
      }
    }
  }

  const products = company.products as { id: string }[];
  if (!Array.isArray(company.customers)) company.customers = [];
  for (const customer of company.customers as Record<string, unknown>[]) {
    if (typeof customer.productId !== "string") customer.productId = products[0]?.id ?? "";
    if (typeof customer.locationId !== "string") customer.locationId = (company.locationId as string) ?? "";
    if (typeof customer.contractLengthWeeks !== "number") customer.contractLengthWeeks = 52;
    if (typeof customer.contractEndWeek !== "number") customer.contractEndWeek = ((customer.contractedSince as number) ?? 0) + 52;
    if (typeof customer.paymentReliability !== "number") customer.paymentReliability = 75;
    if (typeof customer.ordersFulfilled !== "number") customer.ordersFulfilled = 0;
    if (typeof customer.ordersMissed !== "number") customer.ordersMissed = 0;
    if (typeof customer.complaints !== "number") customer.complaints = 0;
  }

  if (!Array.isArray(company.suppliers)) company.suppliers = [];
  const suppliers = company.suppliers as Record<string, unknown>[];
  const suppliersMissingAllocation = suppliers.filter((s) => typeof s.purchaseAllocationPct !== "number");
  if (suppliersMissingAllocation.length > 0 && suppliers.length > 0) {
    const evenShare = 1 / suppliers.length;
    for (const supplier of suppliers) supplier.purchaseAllocationPct = evenShare;
  }
  for (const supplier of suppliers) {
    if (typeof supplier.minimumOrderUnits !== "number") supplier.minimumOrderUnits = 15;
    if (typeof supplier.negotiationRounds !== "number") supplier.negotiationRounds = 0;
    if (supplier.lastNegotiationWeek === undefined) supplier.lastNegotiationWeek = null;
  }

  if (!Array.isArray(company.employees)) company.employees = [];
  for (const employee of company.employees as Record<string, unknown>[]) {
    if (employee.facilityId === undefined) employee.facilityId = facilities[0]?.id ?? null;
    if (employee.managerId === undefined) employee.managerId = null;
    if (!employee.allocation || typeof employee.allocation !== "object") {
      const dept = employee.department as string;
      const fn = dept === "purchasing" ? "purchasing" : dept === "sales" ? "sales" : dept === "accounting" ? "accounting" : dept === "production" || dept === "quality" || dept === "maintenance" ? "operations" : "administration";
      employee.allocation = { accounting: 0, purchasing: 0, sales: 0, operations: 0, administration: 0, [fn]: 100 };
    }
  }

  if (!company.founderAllocation) {
    company.founderAllocation = { production: 0.4, purchasing: 0.2, sales: 0.2, accounting: 0.2, administration: 0 };
  } else {
    const fa = company.founderAllocation as Record<string, unknown>;
    if (typeof fa.administration !== "number") fa.administration = 0;
  }

  if (!company.delegation) company.delegation = defaultDelegationSettings();
  if (!Array.isArray(company.managerDecisionLog)) company.managerDecisionLog = [];
  if (!company.rawMaterialInventoryUnits && company.rawMaterialInventoryUnits !== 0) company.rawMaterialInventoryUnits = 0;
  if (!Array.isArray(company.enteredMarkets)) company.enteredMarkets = [];
  if (!Array.isArray(company.inTransitShipments)) company.inTransitShipments = [];
  if (!Array.isArray(company.prospects)) company.prospects = [];
  for (const prospect of company.prospects as Record<string, unknown>[]) {
    if (typeof prospect.hasCurrentSupplier !== "boolean") prospect.hasCurrentSupplier = false;
    if (typeof prospect.buyingFrequencyWeeks !== "number") prospect.buyingFrequencyWeeks = 8;
    if (!Array.isArray(prospect.outreachHistory)) prospect.outreachHistory = [];
  }
  if (!Array.isArray(company.salesOrders)) company.salesOrders = [];
  if (!Array.isArray(company.invoices)) company.invoices = [];
  if (!Array.isArray(company.purchaseOrders)) company.purchaseOrders = [];
  if (!Array.isArray(company.bills)) company.bills = [];
  if (typeof company.reputation !== "number") company.reputation = 50;

  const market = state.market as unknown as Record<string, unknown>;
  if (market && (!market.regions || typeof market.regions !== "object")) {
    const homeLocationId = company.locationId as string;
    market.regions = {
      [homeLocationId]: {
        locationId: homeLocationId,
        weeklyDemandUnits: market.regionalWeeklyDemandUnits,
        estimatedDemandRangeUnits: market.estimatedDemandRangeUnits,
        avgMarketPrice: market.avgMarketPrice,
        competitivePressure: 0.3,
      },
    };
  }
  if (!Array.isArray(state.competitors)) state.competitors = [];
  for (const competitor of state.competitors as unknown as Record<string, unknown>[]) {
    if (!competitor.locationId || competitor.locationId === "regional") competitor.locationId = (company.locationId as string) ?? "wi-greenbay";
  }

  if (state.lastManagementSnapshot === undefined) state.lastManagementSnapshot = null;
  if (!Array.isArray(state.recentEventLog)) state.recentEventLog = [];
  if (!Array.isArray(state.lastEvaluations)) state.lastEvaluations = [];

  return state;
}
