import type { JournalEntry, JournalLine } from "../types/finance";
import { ACCOUNTS_BY_ID } from "../data/chartOfAccounts";

export class UnbalancedEntryError extends Error {}

let entryCounter = 0;
export function nextJournalEntryId(): string {
  entryCounter += 1;
  return `je-${entryCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Restores the id counter after a load so newly-created ids never collide. */
export function seedJournalEntryCounter(existingEntries: JournalEntry[]): void {
  let max = 0;
  for (const e of existingEntries) {
    const m = /^je-(\d+)-/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  entryCounter = Math.max(entryCounter, max);
}

export function linesBalance(lines: JournalLine[]): boolean {
  const debits = lines.reduce((s, l) => s + l.debit, 0);
  const credits = lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(debits - credits) < 0.005;
}

export function makeEntry(params: {
  week: number;
  date: string;
  memo: string;
  source: string;
  lines: JournalLine[];
  cashFlowCategory?: JournalEntry["cashFlowCategory"];
  productId?: string;
}): JournalEntry {
  if (!linesBalance(params.lines)) {
    const debits = params.lines.reduce((s, l) => s + l.debit, 0);
    const credits = params.lines.reduce((s, l) => s + l.credit, 0);
    throw new UnbalancedEntryError(
      `Unbalanced entry "${params.memo}" (${params.source}): debits ${debits.toFixed(2)} != credits ${credits.toFixed(2)}`,
    );
  }
  return {
    id: nextJournalEntryId(),
    week: params.week,
    date: params.date,
    memo: params.memo,
    source: params.source,
    lines: params.lines,
    cashFlowCategory: params.cashFlowCategory,
    productId: params.productId,
  };
}

export function dr(accountId: string, amount: number): JournalLine {
  return { accountId, debit: round2(amount), credit: 0 };
}
export function cr(accountId: string, amount: number): JournalLine {
  return { accountId, debit: 0, credit: round2(amount) };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Signed balance for an account as of (and including) `throughWeek`, in the account's natural sign (positive = normal side). */
export function accountBalance(entries: JournalEntry[], accountId: string, throughWeek: number): number {
  const account = ACCOUNTS_BY_ID[accountId];
  if (!account) return 0;
  let debitTotal = 0;
  let creditTotal = 0;
  for (const entry of entries) {
    if (entry.week > throughWeek) continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      debitTotal += line.debit;
      creditTotal += line.credit;
    }
  }
  const net = debitTotal - creditTotal;
  return account.normalSide === "debit" ? round2(net) : round2(-net);
}

export function accountBalanceForWeek(entries: JournalEntry[], accountId: string, week: number): number {
  return accountBalance(entries, accountId, week) - accountBalance(entries, accountId, week - 1);
}

export interface TrialBalanceRow {
  accountId: string;
  name: string;
  debit: number;
  credit: number;
}

export function trialBalance(entries: JournalEntry[], throughWeek: number): {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
} {
  const rows: TrialBalanceRow[] = [];
  for (const account of Object.values(ACCOUNTS_BY_ID)) {
    const balance = accountBalance(entries, account.id, throughWeek);
    if (Math.abs(balance) < 0.005) continue;
    rows.push({
      accountId: account.id,
      name: account.name,
      debit: account.normalSide === "debit" && balance > 0 ? balance : account.normalSide === "credit" && balance < 0 ? -balance : 0,
      credit: account.normalSide === "credit" && balance > 0 ? balance : account.normalSide === "debit" && balance < 0 ? -balance : 0,
    });
  }
  const totalDebits = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredits = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, totalDebits, totalCredits, balanced: Math.abs(totalDebits - totalCredits) < 0.01 };
}
