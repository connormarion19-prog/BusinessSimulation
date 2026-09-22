import type { IndustrySimContext, IndustryWeekResult } from "../../types/industry";
import type { JournalEntry } from "../../types/finance";
import type { Department, Employee, WeeklyEvaluation } from "../../types/employee";
import type { CustomerAccount, MarketEntry, ProductLine, SupplierRelationship } from "../../types/core";
import { makeEntry, dr, cr, round2, accountBalance } from "../../engine/ledger";
import { chance, nextRange } from "../../engine/rng";
import { computeWeeklyPerformance, updateMoraleAndFatigue, computeFunctionSkill, totalAllocationPct, computeOverallocationPenalty, WORK_FUNCTIONS, type PerformanceResult } from "../../engine/performance";
import type { WorkFunction } from "../../types/employee";
import { buildEvaluation } from "../../engine/evaluation";
import { rollWeeklyEvents } from "../../engine/events";
import { PAPER_EVENTS, supplierShortfallFlagKey } from "./events";
import { PAPER_PRODUCTS_BY_ID } from "./products";
import { PAPER_ROLES_BY_ID } from "./roles";
import { computeManagerSpanCapacity, computeSpanOverloadFactor, directReportsOf } from "../../engine/management";
import { estimateNearbyCompetitorCapacity } from "../../engine/geography";
import { freightCostPerUnit, nearestFacility } from "../../engine/logistics";
import { LOCATIONS_BY_ID } from "../../data/locations";

const FOUNDER_BASE_UNITS_PER_WEEK = 95;
const FOUNDER_BASE_SKILL = 62;
const PRODUCTION_WORKER_BASE_UNITS = 120;
const MACHINE_OPERATOR_BASE_UNITS = 170;
const PAYROLL_TAX_RATE = 0.0765;
const FOUNDER_MIN_EFFECTIVENESS_APPLIED = 0.35;

const PAYROLL_ROUTING: Record<string, "labor" | "overhead" | "admin" | "sales"> = {
  "production-worker": "labor",
  "machine-operator": "labor",
  "maintenance-tech": "overhead",
  "quality-inspector": "overhead",
  "purchasing-agent": "overhead",
  "purchasing-manager": "overhead",
  "plant-manager": "overhead",
  "regional-operations-manager": "overhead",
  "sales-rep": "sales",
  "sales-manager": "sales",
  bookkeeper: "admin",
  controller: "admin",
  "business-generalist": "admin",
  "operations-associate": "admin",
  "sales-operations-associate": "admin",
  "finance-admin-associate": "admin",
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Deducts sold units from facility inventory buckets, preferring a specific facility (e.g. the one that served the sale) before spreading the remainder proportionally across other stocked facilities. Keeps sum(facilityInventory) in sync with the pooled inventoryUnits total that sales actually draw from. */
function deductFacilityInventory(product: ProductLine, preferredFacilityId: string | undefined, qty: number): void {
  let remaining = qty;
  if (preferredFacilityId) {
    const have = product.facilityInventory[preferredFacilityId] ?? 0;
    const take = Math.min(have, remaining);
    if (take > 0) {
      product.facilityInventory[preferredFacilityId] = round2(have - take);
      remaining = round2(remaining - take);
    }
  }
  if (remaining <= 0.01) return;
  const bucketIds = Object.keys(product.facilityInventory).filter(
    (id) => id !== preferredFacilityId && (product.facilityInventory[id] ?? 0) > 0,
  );
  const totalOther = bucketIds.reduce((s, id) => s + (product.facilityInventory[id] ?? 0), 0);
  if (totalOther <= 0) return;
  for (const id of bucketIds) {
    const share = (product.facilityInventory[id] ?? 0) / totalOther;
    const take = Math.min(product.facilityInventory[id] ?? 0, round2(remaining * share));
    product.facilityInventory[id] = round2((product.facilityInventory[id] ?? 0) - take);
  }
}

function activeByRole(ctx: IndustrySimContext, roleId: string): Employee | undefined {
  return ctx.company.employees.find((e) => e.status === "active" && e.roleId === roleId);
}

/**
 * Additional function capacity from every active employee who isn't already the "primary" skill
 * source for that function (a dedicated specialist, if one exists) but has real allocated time in
 * it — most notably generalists who split their week across several functions. This is genuinely
 * additive on top of the primary-source formulas, so a single-specialist-per-function company (the
 * historical/common case) sees zero change, while hiring a generalist visibly adds capacity.
 */
function supplementalFunctionSkill(
  activeEmployees: Employee[],
  perfByEmployeeId: Record<string, PerformanceResult>,
  fn: WorkFunction,
  excludeEmployeeId: string | undefined,
): number {
  let total = 0;
  for (const emp of activeEmployees) {
    if (emp.id === excludeEmployeeId) continue;
    const pct = emp.allocation[fn] ?? 0;
    if (pct <= 0) continue;
    const role = PAPER_ROLES_BY_ID[emp.roleId];
    const affinity = role?.functionAffinity[fn] ?? 0.3;
    const perf = perfByEmployeeId[emp.id];
    const skill = computeFunctionSkill(emp, fn, affinity) * (perf?.rampFactor ?? 1) * (perf?.moraleFactor ?? 1) * computeOverallocationPenalty(totalAllocationPct(emp));
    total += (pct / 100) * skill;
  }
  return total;
}

/** The active manager (department: "management") whose role oversees the given operational department, if one exists. */
function managerForDepartment(ctx: IndustrySimContext, department: Department): Employee | undefined {
  return ctx.company.employees.find(
    (e) => e.status === "active" && e.department === "management" && PAPER_ROLES_BY_ID[e.roleId]?.managesDepartment === department,
  );
}

function computeManagerBonus(manager: Employee, perfByEmployeeId: Record<string, PerformanceResult>, company: IndustrySimContext["company"]): number {
  const perf = perfByEmployeeId[manager.id];
  if (!perf) return 1;
  const skillBonus = clamp(1 + (perf.coreSkill - 55) / 180, 0.9, 1.25);
  const reportCount = directReportsOf(company, manager.id).length;
  return skillBonus * computeSpanOverloadFactor(manager, reportCount);
}

interface ProductWeekResult {
  goodUnits: number;
  scrapUnits: number;
  unitsSold: number;
  unitsUnfulfilled: number;
}

export function simulatePaperManufacturingWeek(ctx: IndustrySimContext): IndustryWeekResult {
  const { company, market, week, date, rng } = ctx;
  const entries: JournalEntry[] = [];
  const narrativeNotes: string[] = [];
  const evaluations: WeeklyEvaluation[] = [];
  ctx.eventFlags = {};
  const founderEffectiveness = clamp(ctx.founderEffectiveness, FOUNDER_MIN_EFFECTIVENESS_APPLIED, 1);

  const eventResult = rollWeeklyEvents(PAPER_EVENTS, ctx, ctx.difficulty);
  entries.push(...eventResult.entries);
  narrativeNotes.push(...eventResult.narratives);
  const historyEvents = [...eventResult.historyEvents];

  const homeFacility = company.facilities[0];
  const activeProducts = company.products.filter((p) => p.active);
  const sellableProducts = company.products.filter((p) => p.active || p.inventoryUnits > 0.5);
  for (const product of company.products) {
    if (!product.active) product.unitsProducedLastWeek = 0;
    if (!sellableProducts.includes(product)) {
      product.unitsSoldLastWeek = 0;
      product.unitsUnfulfilledLastWeek = 0;
    }
  }

  // ---- 1. Employee performance for the week (drives everything downstream) ----
  const perfByEmployeeId: Record<string, PerformanceResult> = {};
  const activeEmployees = company.employees.filter((e) => e.status === "active");
  for (const emp of activeEmployees) {
    perfByEmployeeId[emp.id] = computeWeeklyPerformance(emp, week, rng);
  }
  const plantManager = managerForDepartment(ctx, "production");
  const plantManagerBonus = plantManager ? computeManagerBonus(plantManager, perfByEmployeeId, company) : 1;

  // ---- 2. Purchasing: split orders across suppliers by allocation, each negotiates and delivers independently ----
  const purchasingManager = managerForDepartment(ctx, "purchasing");
  const purchasingAgent = activeByRole(ctx, "purchasing-agent");
  const purchasingSkillSource = purchasingManager ?? purchasingAgent;
  const purchasingSkill = purchasingSkillSource
    ? perfByEmployeeId[purchasingSkillSource.id].coreSkill
    : FOUNDER_BASE_SKILL * (0.5 + company.founderAllocation.purchasing) * founderEffectiveness;
  const supplementalPurchasingSkill = supplementalFunctionSkill(activeEmployees, perfByEmployeeId, "purchasing", purchasingSkillSource?.id);
  const purchasingEffectiveness = clamp((purchasingSkill + supplementalPurchasingSkill * 0.8) / 65, 0.5, 1.6);
  const bufferWeeks = clamp(1 + purchasingEffectiveness, 1, 3.5);

  const operatingFacilities = company.facilities.filter((f) => f.status === "operating");
  const totalMachineCapacity = operatingFacilities.reduce((s, f) => s + f.baseWeeklyCapacityUnits * (f.condition / 100), 0);
  const projectedWeeklyConsumption = activeProducts.reduce(
    (sum, p) => sum + totalMachineCapacity * p.capacityAllocationPct * p.inputUnitsPerProductUnit,
    0,
  );
  const targetInventory = projectedWeeklyConsumption * bufferWeeks;
  const totalOrderQty = Math.max(0, targetInventory - company.rawMaterialInventoryUnits);

  let rawMaterialsValue = accountBalance(company.entries, "raw-materials", week - 1);
  const supplierDeliveries: { supplier: SupplierRelationship; delivered: number; cost: number }[] = [];

  for (const supplier of company.suppliers) {
    const orderQty = totalOrderQty * supplier.purchaseAllocationPct;
    if (orderQty <= 0.5) continue;
    const negotiatedDiscount = purchasingSkillSource
      ? clamp((purchasingSkill - 50) / 100 * 0.06, 0, 0.06)
      : clamp(company.founderAllocation.purchasing * 0.03 * founderEffectiveness, 0, 0.03);
    const unitPrice = round2(supplier.pricePerUnit * (1 - negotiatedDiscount));
    let deliveredQty = orderQty;
    if (chance(rng, 1 - supplier.reliability)) {
      deliveredQty *= nextRange(rng, 0.4, 0.85);
    }
    const shortfall = ctx.eventFlags[supplierShortfallFlagKey(supplier.id)] ?? 0;
    if (shortfall > 0) deliveredQty = Math.max(0, deliveredQty - shortfall);
    deliveredQty = round2(deliveredQty);
    const cost = round2(deliveredQty * unitPrice);
    if (deliveredQty > 0) {
      company.rawMaterialInventoryUnits = round2(company.rawMaterialInventoryUnits + deliveredQty);
      rawMaterialsValue = round2(rawMaterialsValue + cost);
      entries.push(
        makeEntry({
          week,
          date,
          memo: `Pulp purchase from ${supplier.name}`,
          source: "purchasing",
          lines: [dr("raw-materials", cost), cr("ap", cost)],
          cashFlowCategory: "operating",
        }),
      );
      supplierDeliveries.push({ supplier, delivered: deliveredQty, cost });
    }
  }
  if (supplierDeliveries.length > 0) {
    const totalDelivered = supplierDeliveries.reduce((s, d) => s + d.delivered, 0);
    narrativeNotes.push(
      `Purchasing ordered ${Math.round(totalOrderQty)} pulp-tons across ${supplierDeliveries.length} supplier(s); ${Math.round(totalDelivered)} arrived.`,
    );
  } else if (totalOrderQty > 0.5) {
    narrativeNotes.push(`Purchasing tried to order ${Math.round(totalOrderQty)} pulp-tons, but nothing arrived this week.`);
  }

  // ---- 3. Production: capacity is aggregated across every facility, then split across active products ----
  const productionEmployees = activeEmployees.filter((e) => e.roleId === "production-worker" || e.roleId === "machine-operator");
  const founderProductionContribution = company.founderAllocation.production * FOUNDER_BASE_UNITS_PER_WEEK * (FOUNDER_BASE_SKILL / 65) * founderEffectiveness;

  const facilityLaborCapacity = new Map<string, number>();
  const facilityMachineCapacity = new Map<string, number>();
  for (const facility of operatingFacilities) {
    facilityMachineCapacity.set(facility.id, facility.baseWeeklyCapacityUnits * (facility.condition / 100));
    facilityLaborCapacity.set(facility.id, facility.id === homeFacility.id ? founderProductionContribution : 0);
  }
  let totalLaborCapacity = founderProductionContribution;
  for (const emp of productionEmployees) {
    const facilityId = emp.facilityId && facilityLaborCapacity.has(emp.facilityId) ? emp.facilityId : homeFacility.id;
    const base = emp.roleId === "machine-operator" ? MACHINE_OPERATOR_BASE_UNITS : PRODUCTION_WORKER_BASE_UNITS;
    const reportsToPlantManager = plantManager !== undefined && emp.managerId === plantManager.id;
    const bonus = reportsToPlantManager ? plantManagerBonus : 1;
    const contribution = base * perfByEmployeeId[emp.id].outputFactor * bonus;
    facilityLaborCapacity.set(facilityId, (facilityLaborCapacity.get(facilityId) ?? 0) + contribution);
    totalLaborCapacity += contribution;
  }

  // Generalists who aren't dedicated production-worker/machine-operator hires still add real floor
  // capacity wherever they've allocated operations time — a genuinely additional, smaller-scale
  // contribution on top of the dedicated production headcount above.
  for (const emp of activeEmployees) {
    if (emp.roleId === "production-worker" || emp.roleId === "machine-operator") continue;
    const opsPct = emp.allocation.operations ?? 0;
    if (opsPct <= 0) continue;
    const role = PAPER_ROLES_BY_ID[emp.roleId];
    const affinity = role?.functionAffinity.operations ?? 0.3;
    const perf = perfByEmployeeId[emp.id];
    const fnSkill = computeFunctionSkill(emp, "operations", affinity);
    const fnOutputFactor = (fnSkill / 68) * perf.rampFactor * perf.moraleFactor * perf.fatigueFactor * computeOverallocationPenalty(totalAllocationPct(emp));
    const contribution = PRODUCTION_WORKER_BASE_UNITS * (opsPct / 100) * fnOutputFactor;
    if (contribution <= 0) continue;
    const facilityId = emp.facilityId && facilityLaborCapacity.has(emp.facilityId) ? emp.facilityId : homeFacility.id;
    facilityLaborCapacity.set(facilityId, (facilityLaborCapacity.get(facilityId) ?? 0) + contribution);
    totalLaborCapacity += contribution;
  }

  const plannedByProduct = new Map<string, number>();
  let totalMaterialsNeeded = 0;
  for (const product of activeProducts) {
    const productMachineCapacity = totalMachineCapacity * product.capacityAllocationPct;
    const productLaborCapacity = totalLaborCapacity * product.capacityAllocationPct;
    const planned = Math.max(0, Math.min(productMachineCapacity, productLaborCapacity));
    plannedByProduct.set(product.id, planned);
    totalMaterialsNeeded += planned * product.inputUnitsPerProductUnit;
  }
  const materialsAvailableRatio = totalMaterialsNeeded > 0 ? clamp(company.rawMaterialInventoryUnits / totalMaterialsNeeded, 0, 1) : 1;

  const qualityInspector = activeByRole(ctx, "quality-inspector");
  const defectRate = qualityInspector ? nextRange(rng, 0.01, 0.025) : nextRange(rng, 0.03, 0.07);

  let totalUnitsAttempted = 0;
  let totalGoodUnits = 0;
  let totalScrapUnits = 0;
  let laborCostAllocated = 0;
  let overheadCostAllocated = 0;
  let overheadDepreciation = 0;
  const productResults = new Map<string, ProductWeekResult>();

  for (const product of activeProducts) {
    const planned = plannedByProduct.get(product.id) ?? 0;
    const unitsAttempted = round2(planned * materialsAvailableRatio);
    const goodUnits = round2(unitsAttempted * (1 - defectRate));
    const scrapUnits = round2(unitsAttempted - goodUnits);
    const materialsConsumed = round2(unitsAttempted * product.inputUnitsPerProductUnit);
    const avgMaterialCost = company.rawMaterialInventoryUnits > 0 ? rawMaterialsValue / company.rawMaterialInventoryUnits : market.inputPricePerUnit;
    const materialsCostConsumed = round2(materialsConsumed * avgMaterialCost);
    company.rawMaterialInventoryUnits = round2(Math.max(0, company.rawMaterialInventoryUnits - materialsConsumed));
    rawMaterialsValue = round2(Math.max(0, rawMaterialsValue - materialsCostConsumed));

    if (materialsCostConsumed > 0) {
      entries.push(
        makeEntry({
          week,
          date,
          memo: `Raw materials consumed into production — ${product.name}`,
          source: "production-materials",
          lines: [dr("finished-goods", materialsCostConsumed), cr("raw-materials", materialsCostConsumed)],
          cashFlowCategory: "noncash",
        }),
      );
      product.fgValueMaterials = round2(product.fgValueMaterials + materialsCostConsumed);
    }

    product.inventoryUnits = round2(product.inventoryUnits + goodUnits);
    product.unitsProducedLastWeek = goodUnits;

    if (goodUnits > 0 && totalMachineCapacity > 0) {
      for (const facility of operatingFacilities) {
        const facCap = facilityMachineCapacity.get(facility.id) ?? 0;
        if (facCap <= 0) continue;
        const facUnits = round2(goodUnits * (facCap / totalMachineCapacity));
        if (facUnits > 0) {
          product.facilityInventory[facility.id] = round2((product.facilityInventory[facility.id] ?? 0) + facUnits);
        }
      }
    }

    totalUnitsAttempted += unitsAttempted;
    totalGoodUnits += goodUnits;
    totalScrapUnits += scrapUnits;
    productResults.set(product.id, { goodUnits, scrapUnits, unitsSold: 0, unitsUnfulfilled: 0 });
  }

  // Payroll: production/machine-operator wages and plant overhead roles capitalize into finished goods, split by this week's output share.
  for (const emp of activeEmployees) {
    const routing = PAYROLL_ROUTING[emp.roleId] ?? "admin";
    const salary = emp.salaryWeekly;
    if (routing === "labor") laborCostAllocated += salary;
    else if (routing === "overhead") overheadCostAllocated += salary;
    else if (routing === "sales") {
      entries.push(makeEntry({ week, date, memo: `${emp.title} salary`, source: "payroll", lines: [dr("salaries-sales", salary), cr("cash", salary)], cashFlowCategory: "operating" }));
    } else {
      entries.push(makeEntry({ week, date, memo: `${emp.title} salary`, source: "payroll", lines: [dr("salaries-admin", salary), cr("cash", salary)], cashFlowCategory: "operating" }));
    }
  }
  const totalActiveSalaries = activeEmployees.reduce((s, e) => s + e.salaryWeekly, 0);
  if (totalActiveSalaries > 0) {
    const payrollTax = round2(totalActiveSalaries * PAYROLL_TAX_RATE);
    entries.push(makeEntry({ week, date, memo: "Employer payroll taxes", source: "payroll-tax", lines: [dr("payroll-tax-expense", payrollTax), cr("cash", payrollTax)], cashFlowCategory: "operating" }));
  }

  // Facility-level costs: each facility's own utilization drives its own decay and utility bill.
  let totalFacilityOverhead = 0;
  const facilityUtilizations: { name: string; utilization: number }[] = [];
  for (const facility of operatingFacilities) {
    const facMachineCap = facilityMachineCapacity.get(facility.id) ?? 0;
    const facLaborCap = facilityLaborCapacity.get(facility.id) ?? 0;
    const facPlanned = Math.min(facMachineCap, facLaborCap);
    const utilizationFraction = facMachineCap > 0 ? clamp(facPlanned / facMachineCap, 0, 1.3) : 0;
    facilityUtilizations.push({ name: facility.name, utilization: utilizationFraction });

    const leaseCost = facility.ownedOutright ? 0 : facility.weeklyLeaseCost;
    const utilityCost = round2(facility.weeklyUtilityBaseCost * (0.5 + 0.5 * utilizationFraction));
    totalFacilityOverhead += leaseCost + utilityCost;
    if (facility.ownedOutright) {
      overheadDepreciation += round2(facility.purchaseValue / 520);
    }

    const decay = utilizationFraction * 1.4 - (activeByRole(ctx, "maintenance-tech") ? 1.8 : 0.3);
    facility.condition = clamp(round2(facility.condition - decay), 20, 100);
  }
  overheadCostAllocated += totalFacilityOverhead;

  if (laborCostAllocated > 0) {
    entries.push(makeEntry({ week, date, memo: "Direct production labor capitalized to finished goods", source: "production-labor", lines: [dr("finished-goods", round2(laborCostAllocated)), cr("cash", round2(laborCostAllocated))], cashFlowCategory: "operating" }));
  }
  if (overheadCostAllocated > 0) {
    entries.push(makeEntry({ week, date, memo: "Manufacturing overhead capitalized to finished goods", source: "production-overhead", lines: [dr("finished-goods", round2(overheadCostAllocated)), cr("cash", round2(overheadCostAllocated))], cashFlowCategory: "operating" }));
  }
  if (overheadDepreciation > 0) {
    entries.push(makeEntry({ week, date, memo: "Facility depreciation capitalized to finished goods", source: "depreciation", lines: [dr("finished-goods", overheadDepreciation), cr("accum-depreciation", overheadDepreciation)], cashFlowCategory: "noncash" }));
  }

  // Split labor/overhead/depreciation across products by each product's share of this week's attempted production
  // (falling back to capacity allocation when nothing was produced, so idle products still absorb their planned share of fixed cost).
  for (const product of activeProducts) {
    const result = productResults.get(product.id);
    if (!result) continue;
    const weight = totalUnitsAttempted > 0 ? (result.goodUnits + result.scrapUnits) / totalUnitsAttempted : product.capacityAllocationPct;
    product.fgValueLabor = round2(product.fgValueLabor + laborCostAllocated * weight);
    product.fgValueOverhead = round2(product.fgValueOverhead + (overheadCostAllocated + overheadDepreciation) * weight);
  }

  entries.push(
    makeEntry({ week, date, memo: "General business insurance", source: "insurance", lines: [dr("insurance-expense", 110 * company.facilities.length), cr("cash", 110 * company.facilities.length)], cashFlowCategory: "operating" }),
  );

  if (activeProducts.length === 1) {
    const p = activeProducts[0];
    const r = productResults.get(p.id)!;
    if (totalUnitsAttempted > 0) {
      narrativeNotes.push(`Produced ${Math.round(r.goodUnits)} sellable ${p.unitLabel}s (${Math.round(r.scrapUnits)} scrapped to defects) against a planning capacity of ${Math.round(totalMachineCapacity)}.`);
    } else {
      narrativeNotes.push(`No production ran this week — insufficient labor allocation or raw materials on hand.`);
    }
  } else if (activeProducts.length > 1) {
    if (totalUnitsAttempted > 0) {
      const lines = activeProducts.map((p) => {
        const r = productResults.get(p.id)!;
        return `${p.name}: ${Math.round(r.goodUnits)} ${p.unitLabel}s`;
      });
      narrativeNotes.push(`Production this week — ${lines.join("; ")}.`);
    } else {
      narrativeNotes.push(`No production ran this week across ${activeProducts.length} product lines — insufficient labor allocation or raw materials on hand.`);
    }
    if (materialsAvailableRatio < 0.98) {
      narrativeNotes.push(`Raw materials covered only ${Math.round(materialsAvailableRatio * 100)}% of planned production across all product lines this week.`);
    }
  }
  if (operatingFacilities.length > 1) {
    narrativeNotes.push(
      `Facility utilization — ${facilityUtilizations.map((f) => `${f.name}: ${Math.round(f.utilization * 100)}%`).join("; ")}.`,
    );
  }
  const underConstruction = company.facilities.filter((f) => f.status === "under-construction");
  if (underConstruction.length > 0) {
    narrativeNotes.push(
      `Under construction — ${underConstruction.map((f) => `${f.name} (opens week ${f.constructionCompleteWeek})`).join("; ")}.`,
    );
  }

  // ---- 4. Sales & demand, per active (or sell-off) product ----
  const salesManager = managerForDepartment(ctx, "sales");
  const salesRep = activeByRole(ctx, "sales-rep");
  const salesReports = salesManager ? activeEmployees.filter((e) => e.managerId === salesManager.id) : [];
  let salesEffectiveness: number;
  if (salesManager && salesReports.length > 0) {
    const avgRepOutput = salesReports.reduce((s, r) => s + perfByEmployeeId[r.id].outputFactor, 0) / salesReports.length;
    salesEffectiveness = clamp(avgRepOutput * computeManagerBonus(salesManager, perfByEmployeeId, company), 0.5, 1.5);
  } else if (salesManager) {
    salesEffectiveness = clamp(perfByEmployeeId[salesManager.id].outputFactor, 0.5, 1.4);
  } else if (salesRep) {
    salesEffectiveness = clamp(perfByEmployeeId[salesRep.id].outputFactor, 0.5, 1.4);
  } else {
    salesEffectiveness = clamp((0.55 + company.founderAllocation.sales * 0.9) * founderEffectiveness, 0.3, 1.3);
  }
  const salesSkillSourceId = salesManager?.id ?? salesRep?.id;
  const supplementalSalesSkill = supplementalFunctionSkill(activeEmployees, perfByEmployeeId, "sales", salesSkillSourceId);
  salesEffectiveness = clamp(salesEffectiveness + supplementalSalesSkill / 130, 0.3, 1.8);
  const competitorCapacity = ctx.competitors.reduce((s, c) => s + c.capacityUnits, 0);
  const homeLocationId = company.locationId;

  interface SalesChannel {
    locationId: string;
    orders: number;
    customers: CustomerAccount[];
    freightPerUnit: number;
    commissionPct: number;
    entry?: MarketEntry;
  }

  let totalRevenue = 0;
  const regionalRevenueThisWeek = new Map<string, number>();
  for (const product of sellableProducts) {
    const template = PAPER_PRODUCTS_BY_ID[product.templateId];
    const categoryShare = template?.categoryDemandShare ?? 1 / Math.max(1, sellableProducts.length);
    const relativePrice = product.referenceMarketPrice > 0 ? product.priceWeekly / product.referenceMarketPrice : 1;
    const productCapacity = totalMachineCapacity * product.capacityAllocationPct;
    const companyShareOfCapacity = productCapacity > 0
      ? productCapacity / (productCapacity + competitorCapacity * categoryShare)
      : 0;
    const spotShareFactor = clamp(Math.pow(relativePrice, -market.priceElasticity), 0.15, 2.5);
    const homeSpotOrders = market.regionalWeeklyDemandUnits * categoryShare * companyShareOfCapacity * spotShareFactor * salesEffectiveness;

    const customersForProduct = company.customers.filter((c) => c.productId === product.id);
    const homeCustomers = customersForProduct.filter((c) => !c.locationId || c.locationId === homeLocationId);
    let homeContractedOrders = 0;
    for (const customer of homeCustomers) {
      const priceAcceptance = clamp(1 - customer.priceSensitivity * (relativePrice - 1), 0.2, 1.3);
      const weeklyDemand = (customer.annualVolumeUnits / 52) * priceAcceptance * (customer.relationshipStrength / 100);
      homeContractedOrders += weeklyDemand;
    }

    // Channel 1 is always the home market (unchanged formula/economics from the single-region era).
    // Additional channels are any other regions the company has actively entered for this product.
    const channels: SalesChannel[] = [
      { locationId: homeLocationId, orders: round2(homeSpotOrders + homeContractedOrders), customers: homeCustomers, freightPerUnit: 0, commissionPct: 0 },
    ];

    const activeEntries = company.enteredMarkets.filter(
      (e) => e.productId === product.id && e.status === "active" && e.locationId !== homeLocationId,
    );
    for (const entry of activeEntries) {
      const region = market.regions[entry.locationId];
      if (!region) continue;
      const regionCompetitorCapacity = estimateNearbyCompetitorCapacity(ctx.competitors, entry.locationId);
      const regionShareOfCapacity = productCapacity > 0
        ? productCapacity / (productCapacity + regionCompetitorCapacity * categoryShare)
        : 0;
      const regionRelativePrice = region.avgMarketPrice > 0 ? product.priceWeekly / region.avgMarketPrice : 1;
      const regionSpotShareFactor = clamp(Math.pow(regionRelativePrice, -market.priceElasticity), 0.15, 2.5);
      const regionSpotOrders = region.weeklyDemandUnits * categoryShare * regionShareOfCapacity * regionSpotShareFactor * salesEffectiveness;

      const regionCustomers = customersForProduct.filter((c) => c.locationId === entry.locationId);
      let regionContractedOrders = 0;
      for (const customer of regionCustomers) {
        const priceAcceptance = clamp(1 - customer.priceSensitivity * (regionRelativePrice - 1), 0.2, 1.3);
        const weeklyDemand = (customer.annualVolumeUnits / 52) * priceAcceptance * (customer.relationshipStrength / 100);
        regionContractedOrders += weeklyDemand;
      }

      let freightPerUnit = 0;
      let commissionPct = 0;
      if (entry.mode === "distributor") {
        commissionPct = 0.22;
      } else {
        const localFacility = entry.facilityId ? company.facilities.find((f) => f.id === entry.facilityId) : undefined;
        const localStock = localFacility ? (product.facilityInventory[localFacility.id] ?? 0) : 0;
        if (localFacility && localStock > 0.5) {
          freightPerUnit = 0.15; // local delivery out of company-owned local stock
        } else {
          const nearest = nearestFacility(operatingFacilities.filter((f) => f.baseWeeklyCapacityUnits > 0), entry.locationId);
          freightPerUnit = nearest ? freightCostPerUnit(nearest.locationId, entry.locationId) : 1.5;
        }
      }

      channels.push({
        locationId: entry.locationId,
        orders: round2(regionSpotOrders + regionContractedOrders),
        customers: regionCustomers,
        freightPerUnit,
        commissionPct,
        entry,
      });
    }

    let unitsSoldTotal = 0;
    let unitsUnfulfilledTotal = 0;
    let productRevenue = 0;

    // Inventory is rationed proportionally across every active channel by its share of total orders this
    // week, rather than first-come/first-served — otherwise a home market whose demand alone exceeds
    // production would always starve every other region down to zero, no matter how much was entered.
    const totalOrdersAllChannels = channels.reduce((s, c) => s + c.orders, 0);
    const fulfillFraction = totalOrdersAllChannels > 0 ? clamp(product.inventoryUnits / totalOrdersAllChannels, 0, 1) : 1;

    for (const channel of channels) {
      const totalOrders = channel.orders;
      const unitsSold = round2(totalOrders * fulfillFraction);
      const unitsUnfulfilled = round2(Math.max(0, totalOrders - unitsSold));
      const fulfillRatio = totalOrders > 0 ? unitsSold / totalOrders : 1;

      for (const customer of channel.customers) {
        if (fulfillRatio > 0.95 && salesEffectiveness > 0.9) {
          customer.relationshipStrength = clamp(customer.relationshipStrength + 1, 0, 100);
          customer.atRisk = false;
        } else if (fulfillRatio < 0.7) {
          customer.relationshipStrength = clamp(customer.relationshipStrength - 6, 0, 100);
          if (customer.relationshipStrength < 35) customer.atRisk = true;
        }
        if (unitsSold > 0) customer.lastOrderWeek = week;
      }

      if (unitsSold > 0) {
        const totalFgValue = product.fgValueMaterials + product.fgValueLabor + product.fgValueOverhead;
        const avgUnitCost = product.inventoryUnits > 0 ? totalFgValue / product.inventoryUnits : 0;
        const costOfSold = round2(unitsSold * avgUnitCost);
        const matShare = totalFgValue > 0 ? product.fgValueMaterials / totalFgValue : 0;
        const laborShare = totalFgValue > 0 ? product.fgValueLabor / totalFgValue : 0;
        const costMat = round2(costOfSold * matShare);
        const costLabor = round2(costOfSold * laborShare);
        const costOh = round2(costOfSold - costMat - costLabor);

        product.fgValueMaterials = round2(Math.max(0, product.fgValueMaterials - costMat));
        product.fgValueLabor = round2(Math.max(0, product.fgValueLabor - costLabor));
        product.fgValueOverhead = round2(Math.max(0, product.fgValueOverhead - costOh));
        product.inventoryUnits = round2(Math.max(0, product.inventoryUnits - unitsSold));
        deductFacilityInventory(
          product,
          channel.locationId === homeLocationId ? homeFacility.id : channel.entry?.facilityId,
          unitsSold,
        );

        const grossRevenue = round2(unitsSold * product.priceWeekly);
        const commission = channel.commissionPct > 0 ? round2(grossRevenue * channel.commissionPct) : 0;
        const freight = channel.freightPerUnit > 0 ? round2(unitsSold * channel.freightPerUnit) : 0;
        const netRevenue = round2(grossRevenue - commission);
        totalRevenue += netRevenue;
        productRevenue += netRevenue;
        regionalRevenueThisWeek.set(channel.locationId, round2((regionalRevenueThisWeek.get(channel.locationId) ?? 0) + netRevenue));

        const destinationNote = channel.locationId !== homeLocationId ? ` (${LOCATIONS_BY_ID[channel.locationId]?.city ?? channel.locationId})` : "";
        entries.push(
          makeEntry({ week, date, memo: `Sales of ${product.name}${destinationNote}`, source: "sale", lines: [dr("ar", grossRevenue), cr("sales-revenue", grossRevenue)], cashFlowCategory: "operating" }),
        );
        if (commission > 0) {
          entries.push(
            makeEntry({ week, date, memo: `Distributor commission — ${product.name}${destinationNote}`, source: "distributor-commission", lines: [dr("distributor-commission-expense", commission), cr("ar", commission)], cashFlowCategory: "operating" }),
          );
        }
        if (freight > 0) {
          entries.push(
            makeEntry({ week, date, memo: `Freight — ${product.name}${destinationNote}`, source: "freight", lines: [dr("freight-expense", freight), cr("cash", freight)], cashFlowCategory: "operating" }),
          );
        }
        entries.push(
          makeEntry({
            week,
            date,
            memo: `Cost of goods sold — ${product.name}`,
            source: "cogs",
            lines: [dr("cogs-materials", costMat), dr("cogs-labor", costLabor), dr("cogs-overhead", costOh), cr("finished-goods", costOfSold)],
            cashFlowCategory: "noncash",
          }),
        );

        if (channel.entry) {
          channel.entry.actualRevenueToDate = round2(channel.entry.actualRevenueToDate + netRevenue - freight - commission);
        }
      }
      unitsSoldTotal = round2(unitsSoldTotal + unitsSold);
      unitsUnfulfilledTotal = round2(unitsUnfulfilledTotal + unitsUnfulfilled);
    }

    if (sellableProducts.length === 1 && unitsSoldTotal > 0) {
      narrativeNotes.push(`Sold ${Math.round(unitsSoldTotal)} ${product.unitLabel}s at $${product.priceWeekly.toFixed(2)} (revenue $${Math.round(productRevenue).toLocaleString()}).`);
    }
    if (activeEntries.length > 0) {
      const regionLines = channels
        .filter((c) => c.locationId !== homeLocationId)
        .map((c) => `${LOCATIONS_BY_ID[c.locationId]?.city ?? c.locationId}: ${Math.round(regionalRevenueThisWeek.get(c.locationId) ?? 0).toLocaleString()}`);
      if (regionLines.length > 0) {
        narrativeNotes.push(`Regional sales — ${product.name}: ${regionLines.join("; ")}.`);
      }
    }

    product.unitsSoldLastWeek = unitsSoldTotal;
    product.unitsUnfulfilledLastWeek = unitsUnfulfilledTotal;
    const existing = productResults.get(product.id);
    if (existing) {
      existing.unitsSold = unitsSoldTotal;
      existing.unitsUnfulfilled = unitsUnfulfilledTotal;
    } else {
      productResults.set(product.id, { goodUnits: 0, scrapUnits: 0, unitsSold: unitsSoldTotal, unitsUnfulfilled: unitsUnfulfilledTotal });
    }
  }

  for (const entry of company.enteredMarkets) {
    if (entry.status === "active") entry.actualWeeksActive += 1;
  }

  if (sellableProducts.length > 1) {
    const soldLines = sellableProducts
      .filter((p) => p.unitsSoldLastWeek > 0)
      .map((p) => `${Math.round(p.unitsSoldLastWeek)} ${p.name} at $${p.priceWeekly.toFixed(2)}`);
    if (soldLines.length > 0) {
      narrativeNotes.push(`Sales this week — ${soldLines.join("; ")} (combined revenue $${Math.round(totalRevenue).toLocaleString()}).`);
    }
    const unfulfilled = sellableProducts.filter((p) => p.unitsUnfulfilledLastWeek > 5);
    if (unfulfilled.length > 0) {
      narrativeNotes.push(`Turned away demand on ${unfulfilled.map((p) => `${Math.round(p.unitsUnfulfilledLastWeek)} ${p.unitLabel}s of ${p.name}`).join(", ")}.`);
    }
  } else if (sellableProducts.length === 1 && sellableProducts[0].unitsUnfulfilledLastWeek > 5) {
    narrativeNotes.push(`Turned away roughly ${Math.round(sellableProducts[0].unitsUnfulfilledLastWeek)} ${sellableProducts[0].unitLabel}s of demand due to insufficient inventory.`);
  }

  // ---- 5. Accounting: AR/AP steady-state collection & payment ----
  const bookkeeper = activeByRole(ctx, "bookkeeper");
  const controller = managerForDepartment(ctx, "accounting");
  const accountingSkillSource = controller ?? bookkeeper;
  const accountingSkill = accountingSkillSource
    ? perfByEmployeeId[accountingSkillSource.id].coreSkill
    : FOUNDER_BASE_SKILL * (0.5 + company.founderAllocation.accounting) * founderEffectiveness;
  const supplementalAccountingSkill = supplementalFunctionSkill(activeEmployees, perfByEmployeeId, "accounting", accountingSkillSource?.id);
  const accountingEffectiveness = clamp((accountingSkill + supplementalAccountingSkill * 0.8) / 65, 0.6, 1.6);

  const avgCustomerTermsWeeks = company.customers.length
    ? company.customers.reduce((s, c) => s + c.paymentTermsDays, 0) / company.customers.length / 7
    : 4;
  const arBalance = accountBalance(company.entries, "ar", week - 1) + entries.filter((e) => e.source === "sale").reduce((s, e) => s + (e.lines.find((l) => l.accountId === "ar")?.debit ?? 0), 0);
  const collectionFraction = clamp((1 / Math.max(1, avgCustomerTermsWeeks)) * accountingEffectiveness, 0.05, 0.9);
  const collected = round2(arBalance * collectionFraction);
  if (collected > 0.5) {
    entries.push(makeEntry({ week, date, memo: "Customer payments collected", source: "ar-collection", lines: [dr("cash", collected), cr("ar", collected)], cashFlowCategory: "operating" }));
  }

  const apBalance = accountBalance(company.entries, "ap", week - 1) + entries.filter((e) => e.source === "purchasing").reduce((s, e) => s + (e.lines.find((l) => l.accountId === "ap")?.credit ?? 0), 0);
  const avgSupplierTermsWeeks = company.suppliers.length
    ? company.suppliers.reduce((s, sup) => s + sup.paymentTermsDays * sup.purchaseAllocationPct, 0) / 7
    : 3;
  const apPaymentFraction = clamp(1 / Math.max(1, avgSupplierTermsWeeks), 0.1, 1);
  const apPaid = round2(apBalance * apPaymentFraction);
  if (apPaid > 0.5) {
    entries.push(makeEntry({ week, date, memo: "Supplier bills paid", source: "ap-payment", lines: [dr("ap", apPaid), cr("cash", apPaid)], cashFlowCategory: "operating" }));
  }

  // ---- 6. Weekly evaluations ----
  for (const emp of activeEmployees) {
    const perf = perfByEmployeeId[emp.id];
    const errors = Math.round(perf.errorRate * 10);
    const { highlights, concerns, metrics } = emp.department === "management"
      ? buildManagerNarrative(emp, activeEmployees, perfByEmployeeId)
      : PAPER_ROLES_BY_ID[emp.roleId]?.roleClass === "generalist"
        ? buildGeneralistNarrative(emp, perf)
        : buildRoleNarrative(emp.roleId, perf, {
            goodUnits: totalGoodUnits,
            scrapUnits: totalScrapUnits,
            unitsSold: sellableProducts.reduce((s, p) => s + p.unitsSoldLastWeek, 0),
            collected,
            apPaid,
            orderQty: totalOrderQty,
          });
    const overallocated = totalAllocationPct(emp) > 100;
    const { morale, fatigue } = updateMoraleAndFatigue(emp, { weekWasHeavy: perf.errorRate > 0.1 || overallocated, recentRaise: emp.lastRaiseWeek === week, recentRecognition: false });
    emp.morale = morale;
    emp.fatigue = fatigue;
    emp.cumulativeErrors += errors;
    emp.cumulativeTasksCompleted += 1;
    const evaluation = buildEvaluation({ employee: emp, week, performanceScore: perf.performanceScore, errors, metrics, highlights, concerns });
    emp.performanceHistory.push(evaluation);
    if (emp.performanceHistory.length > 30) emp.performanceHistory.shift();
    evaluations.push(evaluation);
  }

  // ---- 7. Market evolution ----
  const demandDrift = nextRange(rng, -0.02, 0.025) + (ctx.economy.demandIndex - 1) * 0.15;
  const newDemand = round2(Math.max(200, market.regionalWeeklyDemandUnits * (1 + demandDrift)));
  const competitorAvgPrice = ctx.competitors.length
    ? ctx.competitors.reduce((s, c) => s + c.price, 0) / ctx.competitors.length
    : market.avgMarketPrice;
  const newAvgPrice = round2(market.avgMarketPrice * 0.85 + competitorAvgPrice * 0.15 + nextRange(rng, -0.05, 0.05));

  // Suppliers each drift their own price independently (organic commodity movement); market.inputPricePerUnit
  // becomes a purchase-weighted summary of those, not an independent driver.
  for (const supplier of company.suppliers) {
    supplier.pricePerUnit = round2(Math.max(60, supplier.pricePerUnit * (1 + nextRange(rng, -0.01, 0.012))));
  }
  const totalAllocation = company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);
  const newInputPrice = totalAllocation > 0
    ? round2(company.suppliers.reduce((s, sup) => s + sup.pricePerUnit * sup.purchaseAllocationPct, 0) / totalAllocation)
    : market.inputPricePerUnit;
  const primarySupplierNow = company.suppliers.reduce((best, s) => (s.purchaseAllocationPct > (best?.purchaseAllocationPct ?? -1) ? s : best), undefined as SupplierRelationship | undefined);
  for (const s of company.suppliers) s.isPrimary = s.id === primarySupplierNow?.id;

  // Founding product's reference price tracks the competitor-driven market index directly; any additional
  // product lines drift independently toward their own template price, since competitors don't model them yet.
  const foundingProduct = company.products[0];
  for (const product of company.products) {
    if (product.id === foundingProduct.id) {
      product.referenceMarketPrice = newAvgPrice;
    } else {
      const template = PAPER_PRODUCTS_BY_ID[product.templateId];
      const anchor = template?.suggestedUnitPrice ?? product.referenceMarketPrice;
      const reversion = (anchor - product.referenceMarketPrice) * 0.03;
      product.referenceMarketPrice = round2(Math.max(1, product.referenceMarketPrice + reversion + nextRange(rng, -anchor * 0.01, anchor * 0.012)));
    }
  }

  const updatedMarket = {
    ...market,
    regionalWeeklyDemandUnits: newDemand,
    estimatedDemandRangeUnits: [round2(newDemand * 0.88), round2(newDemand * 1.12)] as [number, number],
    avgMarketPrice: newAvgPrice,
    inputPricePerUnit: newInputPrice,
  };

  return { entries, market: updatedMarket, narrativeNotes, historyEvents, evaluations };
}

const WORK_FUNCTION_LABEL: Record<string, string> = {
  accounting: "accounting",
  purchasing: "purchasing",
  sales: "sales",
  operations: "operations",
  administration: "administrative work",
};

/** A generalist's evaluation is built from their actual allocation split, not a fixed role script — reflects genuinely how their week was actually spent. */
function buildGeneralistNarrative(emp: Employee, perf: PerformanceResult): { highlights: string[]; concerns: string[]; metrics: Record<string, number> } {
  const highlights: string[] = [];
  const concerns: string[] = [];
  const total = totalAllocationPct(emp);
  const sorted = [...WORK_FUNCTIONS].map((fn) => [fn, emp.allocation[fn] ?? 0] as const).filter(([, pct]) => pct > 0).sort((a, b) => b[1] - a[1]);
  const splitText = sorted.map(([fn, pct]) => `${Math.round(pct)}% ${WORK_FUNCTION_LABEL[fn]}`).join(", ");
  highlights.push(splitText ? `Split working time roughly ${splitText} this week.` : "No working capacity allocated this week — sitting idle.");
  if (sorted.length > 0) {
    const [topFn] = sorted[0];
    if (perf.outputFactor > 1.05) highlights.push(`Output on ${WORK_FUNCTION_LABEL[topFn]}, their largest allocation, was above a typical week.`);
  }
  const overBy = total - 100;
  if (overBy > 0.5) {
    concerns.push(`Allocated ${Math.round(total)}% of a full week across all responsibilities — overallocated by ${Math.round(overBy)}%, which is dragging down output and error rate.`);
  } else if (total < 60) {
    concerns.push(`Only ${Math.round(total)}% of a full week is currently allocated — real spare capacity here.`);
  }
  if (perf.errorRate > 0.1) concerns.push("A higher-than-usual error rate this week is worth watching.");

  const metrics: Record<string, number> = { outputFactor: round2(perf.outputFactor), errorRate: round2(perf.errorRate * 100), totalAllocation: round2(total) };
  for (const [fn, pct] of sorted) metrics[`alloc_${fn}`] = pct;
  return { highlights, concerns, metrics };
}

function buildRoleNarrative(
  roleId: string,
  perf: PerformanceResult,
  ctx: { goodUnits: number; scrapUnits: number; unitsSold: number; collected: number; apPaid: number; orderQty: number },
): { highlights: string[]; concerns: string[]; metrics: Record<string, number> } {
  const highlights: string[] = [];
  const concerns: string[] = [];
  const metrics: Record<string, number> = { outputFactor: round2(perf.outputFactor), errorRate: round2(perf.errorRate * 100) };

  switch (roleId) {
    case "production-worker":
    case "machine-operator":
      highlights.push(`Contributed to this week's run of ${Math.round(ctx.goodUnits)} good units.`);
      if (perf.outputFactor > 1.05) highlights.push("Output pace was above a typical week.");
      if (ctx.scrapUnits > ctx.goodUnits * 0.05) concerns.push(`Scrap rate this week was elevated at ${Math.round((ctx.scrapUnits / Math.max(1, ctx.goodUnits + ctx.scrapUnits)) * 100)}%.`);
      break;
    case "maintenance-tech":
      highlights.push("Ran preventive maintenance on the converting line this week.");
      break;
    case "quality-inspector":
      highlights.push(`Inspected outgoing product; scrap held to ${Math.round((ctx.scrapUnits / Math.max(1, ctx.goodUnits + ctx.scrapUnits)) * 100)}%.`);
      break;
    case "purchasing-agent":
      highlights.push(`Managed pulp ordering (${Math.round(ctx.orderQty)} tons targeted this week).`);
      break;
    case "sales-rep":
      highlights.push(`Supported ${Math.round(ctx.unitsSold)} units of sales activity this week.`);
      break;
    case "bookkeeper":
      highlights.push(`Processed collections ($${Math.round(ctx.collected).toLocaleString()}) and vendor payments ($${Math.round(ctx.apPaid).toLocaleString()}).`);
      break;
    default:
      highlights.push("Completed regular duties this week.");
  }

  if (perf.errorRate > 0.1) {
    concerns.push("A higher-than-usual error rate this week is worth watching.");
  }
  return { highlights, concerns, metrics };
}

/** Managers get a report built from their actual team's aggregate numbers this week, with a trend line vs. their own last evaluation where available. */
function buildManagerNarrative(
  manager: Employee,
  activeEmployees: Employee[],
  perfByEmployeeId: Record<string, PerformanceResult>,
): { highlights: string[]; concerns: string[]; metrics: Record<string, number> } {
  const highlights: string[] = [];
  const concerns: string[] = [];
  const reports = activeEmployees.filter((e) => e.managerId === manager.id);
  const managesDepartment = PAPER_ROLES_BY_ID[manager.roleId]?.managesDepartment ?? manager.department;

  if (reports.length === 0) {
    highlights.push(`No direct reports yet — currently the only person in ${managesDepartment}.`);
    return { highlights, concerns, metrics: { outputFactor: round2(perfByEmployeeId[manager.id]?.outputFactor ?? 1), errorRate: 0, teamSize: 0 } };
  }

  const avgOutput = reports.reduce((s, r) => s + perfByEmployeeId[r.id].outputFactor, 0) / reports.length;
  const totalErrors = reports.reduce((s, r) => s + Math.round(perfByEmployeeId[r.id].errorRate * 10), 0);
  const avgMorale = reports.reduce((s, r) => s + r.morale, 0) / reports.length;

  const priorEval = manager.performanceHistory[manager.performanceHistory.length - 1];
  const priorAvgOutput = priorEval?.metrics.teamAvgOutput;
  if (typeof priorAvgOutput === "number" && Math.abs(priorAvgOutput - avgOutput) > 0.04) {
    const direction = avgOutput > priorAvgOutput ? "up" : "down";
    highlights.push(
      `Managing ${reports.length} direct report(s) — average team output moved ${direction} from ${Math.round(priorAvgOutput * 100)}% to ${Math.round(avgOutput * 100)}% of typical over the last evaluation.`,
    );
  } else {
    highlights.push(`Managing ${reports.length} direct report(s), averaging ${Math.round(avgOutput * 100)}% of typical output this week.`);
  }
  highlights.push(`Team flagged ${totalErrors} error(s) this week; average team morale is ${Math.round(avgMorale)}/100.`);
  if (avgMorale < 45) concerns.push("Team morale is low enough to be a retention risk.");
  if (totalErrors > reports.length * 2) concerns.push("Error count is high relative to team size — may need closer supervision or training.");

  const spanCapacity = computeManagerSpanCapacity(manager);
  if (reports.length > spanCapacity) {
    concerns.push(`${reports.length} direct reports is above the ${spanCapacity} this manager can effectively run — team effectiveness is degraded until a second manager or fewer reports are in place.`);
  }

  return {
    highlights,
    concerns,
    metrics: { outputFactor: round2(perfByEmployeeId[manager.id]?.outputFactor ?? 1), errorRate: 0, teamSize: reports.length, teamAvgOutput: round2(avgOutput) },
  };
}
