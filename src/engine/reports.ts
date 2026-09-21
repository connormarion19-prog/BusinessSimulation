import type { BalanceSheet, CashFlowStatement, FinancialRatios, IncomeStatement, JournalEntry } from "../types/finance";
import { ACCOUNTS_BY_ID, COGS_ACCOUNT_IDS, OPERATING_EXPENSE_ACCOUNT_IDS } from "../data/chartOfAccounts";
import { accountBalance, round2 } from "./ledger";

function activityInRange(entries: JournalEntry[], accountId: string, startWeek: number, endWeek: number): number {
  const account = ACCOUNTS_BY_ID[accountId];
  if (!account) return 0;
  let debitTotal = 0;
  let creditTotal = 0;
  for (const entry of entries) {
    if (entry.week < startWeek || entry.week > endWeek) continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      debitTotal += line.debit;
      creditTotal += line.credit;
    }
  }
  const net = debitTotal - creditTotal;
  return account.normalSide === "debit" ? round2(net) : round2(-net);
}

export function incomeStatementForRange(
  entries: JournalEntry[],
  startWeek: number,
  endWeek: number,
  periodLabel: string,
): IncomeStatement {
  const revenue = round2(
    activityInRange(entries, "sales-revenue", startWeek, endWeek) +
      activityInRange(entries, "other-income", startWeek, endWeek),
  );
  const cogs = round2(COGS_ACCOUNT_IDS.reduce((s, id) => s + activityInRange(entries, id, startWeek, endWeek), 0));
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue !== 0 ? grossProfit / revenue : 0;

  const operatingExpenses: Record<string, number> = {};
  let totalOperatingExpenses = 0;
  for (const id of OPERATING_EXPENSE_ACCOUNT_IDS) {
    const amt = activityInRange(entries, id, startWeek, endWeek);
    if (Math.abs(amt) > 0.005) operatingExpenses[id] = amt;
    totalOperatingExpenses += amt;
  }
  totalOperatingExpenses = round2(totalOperatingExpenses);

  const operatingIncome = round2(grossProfit - totalOperatingExpenses);
  const interestExpense = round2(activityInRange(entries, "interest-expense", startWeek, endWeek));
  const incomeBeforeTax = round2(operatingIncome - interestExpense);
  const taxExpense = round2(activityInRange(entries, "income-tax-expense", startWeek, endWeek));
  const netIncome = round2(incomeBeforeTax - taxExpense);

  return {
    periodLabel,
    revenue,
    cogs,
    grossProfit,
    grossMargin,
    operatingExpenses,
    totalOperatingExpenses,
    operatingIncome,
    interestExpense,
    incomeBeforeTax,
    taxExpense,
    netIncome,
  };
}

const ASSET_IDS = ["cash", "ar", "raw-materials", "finished-goods", "prepaid-expenses", "ppe", "accum-depreciation"];
const LIABILITY_IDS = ["ap", "accrued-payroll", "accrued-interest", "taxes-payable", "notes-payable"];

export function balanceSheetAsOf(entries: JournalEntry[], asOfWeek: number): BalanceSheet {
  const assets: Record<string, number> = {};
  let totalAssets = 0;
  for (const id of ASSET_IDS) {
    const bal = accountBalance(entries, id, asOfWeek);
    assets[id] = bal;
    totalAssets += bal;
  }
  totalAssets = round2(totalAssets);

  const liabilities: Record<string, number> = {};
  let totalLiabilities = 0;
  for (const id of LIABILITY_IDS) {
    const bal = accountBalance(entries, id, asOfWeek);
    liabilities[id] = bal;
    totalLiabilities += bal;
  }
  totalLiabilities = round2(totalLiabilities);

  // Retained earnings = cumulative net income since inception, computed live (never a stored plug).
  const cumulativeIncome = incomeStatementForRange(entries, -1_000_000, asOfWeek, "cumulative");
  const equity: Record<string, number> = {
    "owner-contributions": accountBalance(entries, "owner-contributions", asOfWeek),
    "retained-earnings": round2(cumulativeIncome.netIncome - accountBalance(entries, "distributions", asOfWeek)),
  };
  const totalEquity = round2(equity["owner-contributions"] + equity["retained-earnings"]);

  const imbalanceAmount = round2(totalAssets - (totalLiabilities + totalEquity));

  return {
    asOfWeek,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    totalEquity,
    balances: Math.abs(imbalanceAmount) < 0.01,
    imbalanceAmount,
  };
}

export function cashFlowForRange(
  entries: JournalEntry[],
  startWeek: number,
  endWeek: number,
  periodLabel: string,
): CashFlowStatement {
  let operating = 0;
  let investing = 0;
  let financing = 0;
  for (const entry of entries) {
    if (entry.week < startWeek || entry.week > endWeek) continue;
    const cashLine = entry.lines.find((l) => l.accountId === "cash");
    if (!cashLine) continue;
    const delta = cashLine.debit - cashLine.credit;
    const category = entry.cashFlowCategory ?? "operating";
    if (category === "investing") investing += delta;
    else if (category === "financing") financing += delta;
    else if (category === "operating") operating += delta;
  }
  operating = round2(operating);
  investing = round2(investing);
  financing = round2(financing);
  const netChange = round2(operating + investing + financing);
  const beginningCash = accountBalance(entries, "cash", startWeek - 1);
  const endingCash = accountBalance(entries, "cash", endWeek);
  return { periodLabel, operating, investing, financing, netChange, beginningCash, endingCash };
}

export function financialRatios(entries: JournalEntry[], asOfWeek: number, trailingWeeks = 12): FinancialRatios {
  const bs = balanceSheetAsOf(entries, asOfWeek);
  const is = incomeStatementForRange(entries, Math.max(0, asOfWeek - trailingWeeks + 1), asOfWeek, "trailing");

  const currentAssets = bs.assets.cash + bs.assets.ar + bs.assets["raw-materials"] + bs.assets["finished-goods"] + bs.assets["prepaid-expenses"];
  const currentLiabilities = bs.liabilities.ap + bs.liabilities["accrued-payroll"] + bs.liabilities["accrued-interest"] + bs.liabilities["taxes-payable"];
  const quickAssets = bs.assets.cash + bs.assets.ar;

  const weeklyOpEx = is.totalOperatingExpenses / Math.max(1, Math.min(trailingWeeks, asOfWeek + 1));
  const weeklyCogsCash = is.cogs / Math.max(1, Math.min(trailingWeeks, asOfWeek + 1));
  const weeklyBurn = weeklyOpEx + weeklyCogsCash;

  return {
    currentRatio: currentLiabilities !== 0 ? round2(currentAssets / currentLiabilities) : null,
    quickRatio: currentLiabilities !== 0 ? round2(quickAssets / currentLiabilities) : null,
    grossMargin: is.revenue !== 0 ? round2(is.grossMargin * 100) : null,
    operatingMargin: is.revenue !== 0 ? round2((is.operatingIncome / is.revenue) * 100) : null,
    netMargin: is.revenue !== 0 ? round2((is.netIncome / is.revenue) * 100) : null,
    debtToEquity: bs.totalEquity !== 0 ? round2(bs.totalLiabilities / bs.totalEquity) : null,
    returnOnEquity: bs.totalEquity !== 0 ? round2((is.netIncome / bs.totalEquity) * 100) : null,
    daysCashOnHand: weeklyBurn > 0 ? round2((bs.assets.cash / weeklyBurn) * 7) : null,
  };
}
