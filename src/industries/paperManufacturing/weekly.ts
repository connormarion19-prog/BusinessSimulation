import type { IndustrySimContext, IndustryWeekResult } from "../../types/industry";
import type { JournalEntry } from "../../types/finance";
import type { Employee, WeeklyEvaluation } from "../../types/employee";
import { makeEntry, dr, cr, round2, accountBalance } from "../../engine/ledger";
import { chance, nextRange } from "../../engine/rng";
import { computeWeeklyPerformance, updateMoraleAndFatigue, type PerformanceResult } from "../../engine/performance";
import { buildEvaluation } from "../../engine/evaluation";
import { rollWeeklyEvents } from "../../engine/events";
import { PAPER_EVENTS } from "./events";

const FOUNDER_BASE_UNITS_PER_WEEK = 95;
const FOUNDER_BASE_SKILL = 62;
const PRODUCTION_WORKER_BASE_UNITS = 120;
const MACHINE_OPERATOR_BASE_UNITS = 170;
const PAYROLL_TAX_RATE = 0.0765;

const PAYROLL_ROUTING: Record<string, "labor" | "overhead" | "admin" | "sales"> = {
  "production-worker": "labor",
  "machine-operator": "labor",
  "maintenance-tech": "overhead",
  "quality-inspector": "overhead",
  "purchasing-agent": "overhead",
  "plant-manager": "overhead",
  "sales-rep": "sales",
  bookkeeper: "admin",
  controller: "admin",
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function activeByRole(ctx: IndustrySimContext, roleId: string): Employee | undefined {
  return ctx.company.employees.find((e) => e.status === "active" && e.roleId === roleId);
}

export function simulatePaperManufacturingWeek(ctx: IndustrySimContext): IndustryWeekResult {
  const { company, market, week, date, rng } = ctx;
  const entries: JournalEntry[] = [];
  const narrativeNotes: string[] = [];
  const evaluations: WeeklyEvaluation[] = [];
  ctx.eventFlags = {};

  const eventResult = rollWeeklyEvents(PAPER_EVENTS, ctx, ctx.difficulty);
  entries.push(...eventResult.entries);
  narrativeNotes.push(...eventResult.narratives);
  const historyEvents = [...eventResult.historyEvents];

  const facility = company.facilities[0];
  const product = company.products.find((p) => p.active) ?? company.products[0];

  // ---- 1. Employee performance for the week (drives everything downstream) ----
  const perfByEmployeeId: Record<string, PerformanceResult> = {};
  const activeEmployees = company.employees.filter((e) => e.status === "active");
  for (const emp of activeEmployees) {
    perfByEmployeeId[emp.id] = computeWeeklyPerformance(emp, week, rng);
  }
  const plantManager = activeByRole(ctx, "plant-manager");
  const managerBonus = plantManager ? clamp(1 + (perfByEmployeeId[plantManager.id].coreSkill - 55) / 180, 0.9, 1.25) : 1;

  // ---- 2. Purchasing: decide order quantity, negotiate price, receive delivery ----
  const purchasingAgent = activeByRole(ctx, "purchasing-agent");
  const purchasingSkill = purchasingAgent
    ? perfByEmployeeId[purchasingAgent.id].coreSkill
    : FOUNDER_BASE_SKILL * (0.5 + company.founderAllocation.purchasing);
  const purchasingEffectiveness = clamp(purchasingSkill / 65, 0.5, 1.4);
  const bufferWeeks = clamp(1 + purchasingEffectiveness, 1, 3.5);

  const machineCapacity = facility.baseWeeklyCapacityUnits * (facility.condition / 100);
  const projectedWeeklyConsumption = machineCapacity * product.inputUnitsPerProductUnit;
  const targetInventory = projectedWeeklyConsumption * bufferWeeks;
  const orderQty = Math.max(0, targetInventory - company.rawMaterialInventoryUnits);

  const primarySupplier = company.suppliers.find((s) => s.isPrimary) ?? company.suppliers[0];
  let rawMaterialsValue = primarySupplier ? accountBalance(company.entries, "raw-materials", week - 1) : 0;

  if (primarySupplier && orderQty > 0.5) {
    const negotiatedDiscount = purchasingAgent
      ? clamp((perfByEmployeeId[purchasingAgent.id].coreSkill - 50) / 100 * 0.06, 0, 0.06)
      : clamp(company.founderAllocation.purchasing * 0.03, 0, 0.03);
    const unitPrice = round2(market.inputPricePerUnit * (1 - negotiatedDiscount));
    let deliveredQty = orderQty;
    if (chance(rng, 1 - primarySupplier.reliability)) {
      deliveredQty *= nextRange(rng, 0.4, 0.85);
    }
    const shortfall = ctx.eventFlags.pulpShortfallUnits ?? 0;
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
          memo: `Pulp purchase from ${primarySupplier.name}`,
          source: "purchasing",
          lines: [dr("raw-materials", cost), cr("ap", cost)],
          cashFlowCategory: "operating",
        }),
      );
      narrativeNotes.push(
        `Purchasing ordered ${Math.round(orderQty)} pulp-tons; ${Math.round(deliveredQty)} arrived at $${unitPrice.toFixed(2)}/ton.`,
      );
    } else if (orderQty > 0.5) {
      narrativeNotes.push(`Purchasing placed an order for ${Math.round(orderQty)} pulp-tons, but nothing arrived this week.`);
    }
  }

  // ---- 3. Production ----
  const productionEmployees = activeEmployees.filter((e) => e.roleId === "production-worker" || e.roleId === "machine-operator");
  let laborCapacity = company.founderAllocation.production * FOUNDER_BASE_UNITS_PER_WEEK * (FOUNDER_BASE_SKILL / 65);
  for (const emp of productionEmployees) {
    const base = emp.roleId === "machine-operator" ? MACHINE_OPERATOR_BASE_UNITS : PRODUCTION_WORKER_BASE_UNITS;
    laborCapacity += base * perfByEmployeeId[emp.id].outputFactor * managerBonus;
  }
  const plannedUnits = Math.min(machineCapacity, laborCapacity);
  const materialConstrainedUnits = product.inputUnitsPerProductUnit > 0
    ? company.rawMaterialInventoryUnits / product.inputUnitsPerProductUnit
    : plannedUnits;
  const unitsAttempted = Math.max(0, Math.min(plannedUnits, materialConstrainedUnits));

  const qualityInspector = activeByRole(ctx, "quality-inspector");
  const defectRate = qualityInspector
    ? nextRange(rng, 0.01, 0.025)
    : nextRange(rng, 0.03, 0.07);
  const goodUnits = round2(unitsAttempted * (1 - defectRate));
  const scrapUnits = round2(unitsAttempted - goodUnits);

  const materialsConsumed = round2(unitsAttempted * product.inputUnitsPerProductUnit);
  const avgMaterialCost = company.rawMaterialInventoryUnits > 0 ? rawMaterialsValue / company.rawMaterialInventoryUnits : market.inputPricePerUnit;
  const materialsCostConsumed = round2(materialsConsumed * avgMaterialCost);
  company.rawMaterialInventoryUnits = round2(Math.max(0, company.rawMaterialInventoryUnits - materialsConsumed));

  let laborCostAllocated = 0;
  let overheadCostAllocated = 0;
  let overheadDepreciation = 0;
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

  const leaseCost = facility.ownedOutright ? 0 : facility.weeklyLeaseCost;
  const utilizationFraction = machineCapacity > 0 ? clamp(unitsAttempted / machineCapacity, 0, 1.3) : 0;
  const utilityCost = round2(facility.weeklyUtilityBaseCost * (0.5 + 0.5 * utilizationFraction));
  overheadCostAllocated += leaseCost + utilityCost;
  if (facility.ownedOutright) {
    overheadDepreciation = round2(facility.purchaseValue / 520);
  }

  if (laborCostAllocated > 0) {
    entries.push(makeEntry({ week, date, memo: "Direct production labor capitalized to finished goods", source: "production-labor", lines: [dr("finished-goods", round2(laborCostAllocated)), cr("cash", round2(laborCostAllocated))], cashFlowCategory: "operating" }));
    product.fgValueLabor = round2(product.fgValueLabor + laborCostAllocated);
  }
  if (overheadCostAllocated > 0) {
    entries.push(makeEntry({ week, date, memo: "Manufacturing overhead capitalized to finished goods", source: "production-overhead", lines: [dr("finished-goods", round2(overheadCostAllocated)), cr("cash", round2(overheadCostAllocated))], cashFlowCategory: "operating" }));
    product.fgValueOverhead = round2(product.fgValueOverhead + overheadCostAllocated);
  }
  if (overheadDepreciation > 0) {
    entries.push(makeEntry({ week, date, memo: "Facility depreciation capitalized to finished goods", source: "depreciation", lines: [dr("finished-goods", overheadDepreciation), cr("accum-depreciation", overheadDepreciation)], cashFlowCategory: "noncash" }));
    product.fgValueOverhead = round2(product.fgValueOverhead + overheadDepreciation);
  }
  if (materialsCostConsumed > 0) {
    entries.push(makeEntry({ week, date, memo: "Raw materials consumed into production", source: "production-materials", lines: [dr("finished-goods", materialsCostConsumed), cr("raw-materials", materialsCostConsumed)], cashFlowCategory: "noncash" }));
    product.fgValueMaterials = round2(product.fgValueMaterials + materialsCostConsumed);
  }

  entries.push(
    makeEntry({ week, date, memo: "General business insurance", source: "insurance", lines: [dr("insurance-expense", 110), cr("cash", 110)], cashFlowCategory: "operating" }),
  );

  product.inventoryUnits = round2(product.inventoryUnits + goodUnits);
  product.unitsProducedLastWeek = goodUnits;

  const decay = utilizationFraction * 1.4 - (activeByRole(ctx, "maintenance-tech") ? 1.8 : 0.3);
  facility.condition = clamp(round2(facility.condition - decay), 20, 100);

  if (unitsAttempted > 0) {
    narrativeNotes.push(
      `Produced ${Math.round(goodUnits)} sellable ${product.unitLabel}s (${Math.round(scrapUnits)} scrapped to defects) against a planning capacity of ${Math.round(machineCapacity)}.`,
    );
  } else {
    narrativeNotes.push(`No production ran this week — insufficient labor allocation or raw materials on hand.`);
  }

  // ---- 4. Sales & demand ----
  const salesRep = activeByRole(ctx, "sales-rep");
  const salesEffectiveness = salesRep
    ? clamp(perfByEmployeeId[salesRep.id].outputFactor, 0.5, 1.4)
    : clamp(0.55 + company.founderAllocation.sales * 0.9, 0.4, 1.3);

  const relativePrice = market.avgMarketPrice > 0 ? product.priceWeekly / market.avgMarketPrice : 1;
  const competitorCapacity = ctx.competitors.reduce((s, c) => s + c.capacityUnits, 0);
  const companyShareOfCapacity = machineCapacity > 0 ? machineCapacity / (machineCapacity + competitorCapacity) : 0;
  const spotShareFactor = clamp(Math.pow(relativePrice, -market.priceElasticity), 0.15, 2.5);
  const spotMarketOrders = market.regionalWeeklyDemandUnits * companyShareOfCapacity * spotShareFactor * salesEffectiveness;

  let contractedOrders = 0;
  for (const customer of company.customers) {
    const priceAcceptance = clamp(1 - customer.priceSensitivity * (relativePrice - 1), 0.2, 1.3);
    const weeklyDemand = (customer.annualVolumeUnits / 52) * priceAcceptance * (customer.relationshipStrength / 100);
    contractedOrders += weeklyDemand;
  }

  const totalOrders = round2(spotMarketOrders + contractedOrders);
  const availableToSell = product.inventoryUnits;
  const unitsSold = round2(Math.min(totalOrders, availableToSell));
  const unitsUnfulfilled = round2(Math.max(0, totalOrders - availableToSell));
  const fulfillRatio = totalOrders > 0 ? unitsSold / totalOrders : 1;

  for (const customer of company.customers) {
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

    const revenue = round2(unitsSold * product.priceWeekly);
    entries.push(
      makeEntry({ week, date, memo: `Sales of ${product.name}`, source: "sale", lines: [dr("ar", revenue), cr("sales-revenue", revenue)], cashFlowCategory: "operating" }),
    );
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
    narrativeNotes.push(`Sold ${Math.round(unitsSold)} ${product.unitLabel}s at $${product.priceWeekly.toFixed(2)} (revenue $${revenue.toLocaleString()}).`);
  }
  product.unitsSoldLastWeek = unitsSold;
  product.unitsUnfulfilledLastWeek = unitsUnfulfilled;
  if (unitsUnfulfilled > 5) {
    narrativeNotes.push(`Turned away roughly ${Math.round(unitsUnfulfilled)} ${product.unitLabel}s of demand due to insufficient inventory.`);
  }

  // ---- 5. Accounting: AR/AP steady-state collection & payment ----
  const bookkeeper = activeByRole(ctx, "bookkeeper");
  const controller = activeByRole(ctx, "controller");
  const accountingSkill = controller
    ? perfByEmployeeId[controller.id].coreSkill
    : bookkeeper
      ? perfByEmployeeId[bookkeeper.id].coreSkill
      : FOUNDER_BASE_SKILL * (0.5 + company.founderAllocation.accounting);
  const accountingEffectiveness = clamp(accountingSkill / 65, 0.6, 1.3);

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
  const avgSupplierTermsWeeks = primarySupplier ? primarySupplier.paymentTermsDays / 7 : 3;
  const apPaymentFraction = clamp(1 / Math.max(1, avgSupplierTermsWeeks), 0.1, 1);
  const apPaid = round2(apBalance * apPaymentFraction);
  if (apPaid > 0.5) {
    entries.push(makeEntry({ week, date, memo: "Supplier bills paid", source: "ap-payment", lines: [dr("ap", apPaid), cr("cash", apPaid)], cashFlowCategory: "operating" }));
  }

  // ---- 6. Weekly evaluations ----
  for (const emp of activeEmployees) {
    const perf = perfByEmployeeId[emp.id];
    const errors = Math.round(perf.errorRate * 10);
    const { highlights, concerns, metrics } = buildRoleNarrative(emp.roleId, perf, {
      goodUnits,
      scrapUnits,
      unitsSold,
      collected,
      apPaid,
      orderQty,
    });
    const { morale, fatigue } = updateMoraleAndFatigue(emp, { weekWasHeavy: perf.errorRate > 0.1, recentRaise: emp.lastRaiseWeek === week, recentRecognition: false });
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
  const newInputPrice = round2(Math.max(80, market.inputPricePerUnit * (1 + nextRange(rng, -0.01, 0.012))));
  const updatedMarket = {
    ...market,
    regionalWeeklyDemandUnits: newDemand,
    estimatedDemandRangeUnits: [round2(newDemand * 0.88), round2(newDemand * 1.12)] as [number, number],
    avgMarketPrice: newAvgPrice,
    inputPricePerUnit: newInputPrice,
  };

  return { entries, market: updatedMarket, narrativeNotes, historyEvents, evaluations };
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
    case "controller":
      highlights.push("Oversaw the accounting function and financial reporting this week.");
      break;
    case "plant-manager":
      highlights.push("Supervised the production floor this week.");
      break;
    default:
      highlights.push("Completed regular duties this week.");
  }

  if (perf.errorRate > 0.1) {
    concerns.push("A higher-than-usual error rate this week is worth watching.");
  }
  return { highlights, concerns, metrics };
}
