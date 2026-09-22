import type { Company } from "../types/core";
import type { JournalEntry } from "../types/finance";
import { accountBalance, round2 } from "./ledger";
import { incomeStatementForRange, balanceSheetAsOf, cashFlowForRange } from "./reports";
import { getCash, weeklyPayrollTotal } from "./company";

/** The magnitude posted to this account on this entry — every line here has exactly one nonzero side, so debit+credit always gives the real amount regardless of the account's normal side. */
function entryLineTotal(entry: JournalEntry, accountId: string): number {
  const line = entry.lines.find((l) => l.accountId === accountId);
  if (!line) return 0;
  return line.debit + line.credit;
}

export interface ProductFinancialLine {
  productId: string;
  productName: string;
  unitLabel: string;
  unitsSold: number;
  revenue: number;
  avgSellingPrice: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  freightCost: number;
  commissionCost: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
}

/** Real, per-product revenue and COGS for a week range, sourced directly from the tagged journal entries the simulation actually posted — never re-derived from a different, possibly-inconsistent model. */
export function explainProductEconomics(company: Company, startWeek: number, endWeek: number): ProductFinancialLine[] {
  const entriesInRange = company.entries.filter((e) => e.week >= startWeek && e.week <= endWeek && e.productId);
  const lines: ProductFinancialLine[] = [];

  for (const product of company.products) {
    const productEntries = entriesInRange.filter((e) => e.productId === product.id);
    const saleEntries = productEntries.filter((e) => e.source === "sale");
    const cogsEntries = productEntries.filter((e) => e.source === "cogs");
    const freightEntries = productEntries.filter((e) => e.source === "freight");
    const commissionEntries = productEntries.filter((e) => e.source === "distributor-commission");

    const revenue = round2(saleEntries.reduce((s, e) => s + entryLineTotal(e, "sales-revenue"), 0));
    if (revenue <= 0 && cogsEntries.length === 0) continue;

    const materialCost = round2(cogsEntries.reduce((s, e) => s + entryLineTotal(e, "cogs-materials"), 0));
    const laborCost = round2(cogsEntries.reduce((s, e) => s + entryLineTotal(e, "cogs-labor"), 0));
    const overheadCost = round2(cogsEntries.reduce((s, e) => s + entryLineTotal(e, "cogs-overhead"), 0));
    const freightCost = round2(freightEntries.reduce((s, e) => s + entryLineTotal(e, "freight-expense"), 0));
    const commissionCost = round2(commissionEntries.reduce((s, e) => s + entryLineTotal(e, "distributor-commission-expense"), 0));
    const totalCogs = round2(materialCost + laborCost + overheadCost);
    const grossProfit = round2(revenue - totalCogs - freightCost - commissionCost);
    const unitsSold = endWeek === startWeek ? product.unitsSoldLastWeek : NaN;

    lines.push({
      productId: product.id,
      productName: product.name,
      unitLabel: product.unitLabel,
      unitsSold: Number.isNaN(unitsSold) ? Math.round(revenue / Math.max(0.01, product.priceWeekly)) : unitsSold,
      revenue,
      avgSellingPrice: product.priceWeekly,
      materialCost,
      laborCost,
      overheadCost,
      freightCost,
      commissionCost,
      totalCogs,
      grossProfit,
      grossMarginPct: revenue > 0 ? round2((grossProfit / revenue) * 100) : null,
    });
  }
  return lines.sort((a, b) => b.revenue - a.revenue);
}

export interface CogsComponentBreakdown {
  materials: number;
  labor: number;
  overhead: number;
  freight: number;
  commission: number;
  total: number;
}

export function explainCogsComponents(company: Company, startWeek: number, endWeek: number): CogsComponentBreakdown {
  const is = incomeStatementForRange(company.entries, startWeek, endWeek, "range");
  const materials = -accountActivity(company.entries, "cogs-materials", startWeek, endWeek);
  const labor = -accountActivity(company.entries, "cogs-labor", startWeek, endWeek);
  const overhead = -accountActivity(company.entries, "cogs-overhead", startWeek, endWeek);
  const freight = -accountActivity(company.entries, "freight-expense", startWeek, endWeek);
  const commission = -accountActivity(company.entries, "distributor-commission-expense", startWeek, endWeek);
  return {
    materials: round2(Math.abs(materials)),
    labor: round2(Math.abs(labor)),
    overhead: round2(Math.abs(overhead)),
    freight: round2(Math.abs(freight)),
    commission: round2(Math.abs(commission)),
    total: round2(is.cogs),
  };
}

function accountActivity(entries: JournalEntry[], accountId: string, startWeek: number, endWeek: number): number {
  let net = 0;
  for (const e of entries) {
    if (e.week < startWeek || e.week > endWeek) continue;
    for (const l of e.lines) {
      if (l.accountId !== accountId) continue;
      net += l.credit - l.debit; // expense accounts are debit-normal; this yields a negative number for real spend
    }
  }
  return net;
}

export interface CashVsProfitExplanation {
  netIncome: number;
  cashChange: number;
  arChange: number;
  inventoryChange: number;
  apChange: number;
  narrative: string;
}

/** Explains the gap between profit and cash movement for a week range — the single most confusing concept for a new player. */
export function explainCashVsProfit(company: Company, startWeek: number, endWeek: number): CashVsProfitExplanation {
  const is = incomeStatementForRange(company.entries, startWeek, endWeek, "range");
  const cf = cashFlowForRange(company.entries, startWeek, endWeek, "range");
  const priorWeek = startWeek - 1;
  const arChange = round2(accountBalance(company.entries, "ar", endWeek) - accountBalance(company.entries, "ar", priorWeek));
  const apChange = round2(accountBalance(company.entries, "ap", endWeek) - accountBalance(company.entries, "ap", priorWeek));
  const rawMaterialsChange = round2(accountBalance(company.entries, "raw-materials", endWeek) - accountBalance(company.entries, "raw-materials", priorWeek));
  const finishedGoodsChange = round2(accountBalance(company.entries, "finished-goods", endWeek) - accountBalance(company.entries, "finished-goods", priorWeek));
  const inventoryChange = round2(rawMaterialsChange + finishedGoodsChange);

  const parts: string[] = [];
  if (is.netIncome > 0 && cf.netChange < is.netIncome - 1) {
    if (arChange > 1) parts.push(`customers owe you $${Math.round(arChange).toLocaleString()} more than they did (sales made on credit, not yet collected)`);
    if (inventoryChange > 1) parts.push(`you're carrying $${Math.round(inventoryChange).toLocaleString()} more in inventory than before`);
    if (apChange < -1) parts.push(`you paid down $${Math.round(Math.abs(apChange)).toLocaleString()} of supplier bills`);
  } else if (is.netIncome < 0 && cf.netChange > is.netIncome + 1) {
    if (arChange < -1) parts.push(`you collected $${Math.round(Math.abs(arChange)).toLocaleString()} of prior receivables`);
    if (apChange > 1) parts.push(`you're carrying $${Math.round(apChange).toLocaleString()} more in unpaid supplier bills`);
    if (inventoryChange < -1) parts.push(`you sold down $${Math.round(Math.abs(inventoryChange)).toLocaleString()} of inventory`);
  }

  const narrative = parts.length > 0
    ? `${is.netIncome >= 0 ? "The company was profitable" : "The company lost money"} this period, but cash moved differently because ${parts.join(", and ")}.`
    : is.netIncome >= 0
      ? "Profit and cash moved roughly together this period — no major receivables, payables, or inventory swings."
      : "The loss this period was also roughly a cash loss — no offsetting receivables, payables, or inventory swings.";

  return { netIncome: is.netIncome, cashChange: cf.netChange, arChange, inventoryChange, apChange, narrative };
}

export interface LossExplanation {
  isLosing: boolean;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  worstProduct: ProductFinancialLine | null;
  narrative: string;
}

/** "Why are we losing money" — grounded in the actual per-product unit economics, not a vague statement. */
export function explainLoss(company: Company, week: number): LossExplanation {
  const is = incomeStatementForRange(company.entries, week, week, "this week");
  const products = explainProductEconomics(company, week, week);
  const worstProduct = products.length > 0 ? [...products].sort((a, b) => a.grossProfit - b.grossProfit)[0] : null;

  let narrative: string;
  if (is.netIncome >= 0) {
    narrative = "The company was profitable this week.";
  } else if (is.grossProfit < 0) {
    const worst = worstProduct;
    const unitCost = worst && worst.unitsSold > 0 ? round2((worst.totalCogs) / worst.unitsSold) : null;
    narrative = worst && unitCost !== null
      ? `Gross loss this week — production cost per unit of ${worst.productName} (~$${unitCost.toFixed(2)}) is running above its average selling price (~$${worst.avgSellingPrice.toFixed(2)}). Raise price, cut production cost, or both.`
      : `Revenue ($${Math.round(is.revenue).toLocaleString()}) didn't cover cost of goods sold ($${Math.round(is.cogs).toLocaleString()}) this week.`;
  } else {
    narrative = `Gross profit was positive ($${Math.round(is.grossProfit).toLocaleString()}) but operating expenses ($${Math.round(is.totalOperatingExpenses).toLocaleString()}) plus interest/tax pushed the company to a net loss — the products themselves are fine, overhead is the problem.`;
  }

  return {
    isLosing: is.netIncome < 0,
    revenue: is.revenue,
    cogs: is.cogs,
    grossProfit: is.grossProfit,
    operatingExpenses: is.totalOperatingExpenses,
    netIncome: is.netIncome,
    worstProduct,
    narrative,
  };
}

export interface CashRunwayWarning {
  cash: number;
  weeklyPayroll: number;
  weeklySupplierPayments: number;
  weeklyDebtService: number;
  weeklyCollections: number;
  netWeeklyBurn: number;
  weeksOfRunway: number | null;
  narrative: string;
}

/** Net cash impact (debit-credit on the cash line) for every entry from a given source in range — positive means cash came in, negative means cash went out. */
function cashImpactForSource(entries: JournalEntry[], source: string, startWeek: number, endWeek: number): number {
  let total = 0;
  for (const e of entries) {
    if (e.week < startWeek || e.week > endWeek || e.source !== source) continue;
    const cashLine = e.lines.find((l) => l.accountId === "cash");
    if (cashLine) total += cashLine.debit - cashLine.credit;
  }
  return total;
}

/** Real weekly-burn breakdown behind the cash warning — every component traceable to an actual driver, not a single opaque number. */
export function computeCashRunwayWarning(company: Company, week: number, trailingWeeks = 4): CashRunwayWarning {
  const cash = getCash(company, week);
  const startWeek = Math.max(0, week - trailingWeeks + 1);
  const weeks = Math.max(1, week - startWeek + 1);
  const weeklyPayroll = weeklyPayrollTotal(company);

  const supplierCashOut = -cashImpactForSource(company.entries, "ap-payment", startWeek, week);
  const collectionsCashIn = cashImpactForSource(company.entries, "ar-collection", startWeek, week);
  const debtCashOut = -cashImpactForSource(company.entries, "loan-payment", startWeek, week);

  const weeklySupplierPayments = round2(Math.max(0, supplierCashOut) / weeks);
  const weeklyCollections = round2(Math.max(0, collectionsCashIn) / weeks);
  const weeklyDebtService = round2(Math.max(0, debtCashOut) / weeks);

  const netWeeklyBurn = round2(weeklyPayroll + weeklySupplierPayments + weeklyDebtService - weeklyCollections);
  const weeksOfRunway = netWeeklyBurn > 0 ? round2(cash / netWeeklyBurn) : null;

  const narrative = weeksOfRunway !== null && weeksOfRunway < 12
    ? `At the current burn rate, cash may become insufficient in approximately ${Math.max(0, Math.round(weeksOfRunway))} week(s). Weekly payroll ($${Math.round(weeklyPayroll).toLocaleString()}) + supplier payments ($${Math.round(weeklySupplierPayments).toLocaleString()}) + debt service ($${Math.round(weeklyDebtService).toLocaleString()}) are outrunning expected collections ($${Math.round(weeklyCollections).toLocaleString()}).`
    : "Cash burn is currently covered by collections — no near-term shortfall projected from this alone.";

  return { cash, weeklyPayroll, weeklySupplierPayments, weeklyDebtService, weeklyCollections, netWeeklyBurn, weeksOfRunway, narrative };
}

export interface RevenueExplanation {
  total: number;
  lines: { productId: string; productName: string; unitsSold: number; unitPrice: number; revenue: number }[];
}

export function explainRevenue(company: Company, startWeek: number, endWeek: number): RevenueExplanation {
  const products = explainProductEconomics(company, startWeek, endWeek);
  return {
    total: round2(products.reduce((s, p) => s + p.revenue, 0)),
    lines: products.map((p) => ({ productId: p.productId, productName: p.productName, unitsSold: p.unitsSold, unitPrice: p.avgSellingPrice, revenue: p.revenue })),
  };
}

export function balanceSheetSnapshotDiff(company: Company, week: number) {
  const bs = balanceSheetAsOf(company.entries, week);
  const prior = balanceSheetAsOf(company.entries, week - 1);
  return { bs, prior };
}
