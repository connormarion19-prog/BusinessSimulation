import { describe, expect, it } from "vitest";
import { makeEntry, dr, cr, accountBalance, trialBalance, UnbalancedEntryError } from "../src/engine/ledger";

describe("ledger", () => {
  it("posts a balanced entry and reflects it in account balances", () => {
    const entry = makeEntry({
      week: 1,
      date: "2025-01-13",
      memo: "Test sale",
      source: "sale",
      lines: [dr("ar", 100), cr("sales-revenue", 100)],
    });
    const entries = [entry];
    expect(accountBalance(entries, "ar", 1)).toBe(100);
    expect(accountBalance(entries, "sales-revenue", 1)).toBe(100);
  });

  it("rejects an unbalanced entry", () => {
    expect(() =>
      makeEntry({
        week: 1,
        date: "2025-01-13",
        memo: "Bad entry",
        source: "test",
        lines: [dr("ar", 100), cr("sales-revenue", 90)],
      }),
    ).toThrow(UnbalancedEntryError);
  });

  it("keeps the trial balance in balance across many entries", () => {
    const entries = [
      makeEntry({ week: 0, date: "2025-01-06", memo: "Founding", source: "owner-contribution", lines: [dr("cash", 100_000), cr("owner-contributions", 100_000)] }),
      makeEntry({ week: 1, date: "2025-01-13", memo: "Buy materials", source: "purchasing", lines: [dr("raw-materials", 5_000), cr("ap", 5_000)] }),
      makeEntry({ week: 1, date: "2025-01-13", memo: "Pay AP", source: "ap-payment", lines: [dr("ap", 2_000), cr("cash", 2_000)] }),
      makeEntry({ week: 1, date: "2025-01-13", memo: "Sale", source: "sale", lines: [dr("ar", 8_000), cr("sales-revenue", 8_000)] }),
      makeEntry({ week: 1, date: "2025-01-13", memo: "COGS", source: "cogs", lines: [dr("cogs-materials", 3_000), cr("finished-goods", 3_000)] }),
    ];
    const tb = trialBalance(entries, 1);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBeCloseTo(tb.totalCredits, 2);
  });

  it("respects week cutoffs when computing balances", () => {
    const entries = [
      makeEntry({ week: 1, date: "2025-01-06", memo: "A", source: "test", lines: [dr("cash", 50), cr("owner-contributions", 50)] }),
      makeEntry({ week: 3, date: "2025-01-20", memo: "B", source: "test", lines: [dr("cash", 25), cr("owner-contributions", 25)] }),
    ];
    expect(accountBalance(entries, "cash", 1)).toBe(50);
    expect(accountBalance(entries, "cash", 2)).toBe(50);
    expect(accountBalance(entries, "cash", 3)).toBe(75);
  });
});
