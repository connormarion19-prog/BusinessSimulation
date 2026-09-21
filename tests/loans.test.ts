import { describe, expect, it } from "vitest";
import { makeLoan, applyWeeklyPayment } from "../src/engine/loans";

describe("loan amortization", () => {
  it("fully amortizes to a zero balance over the loan term", () => {
    const loan = makeLoan({ id: "l1", lender: "Test Bank", principal: 100_000, annualRate: 0.084, termWeeks: 260, startWeek: 0 });
    let totalInterest = 0;
    let totalPrincipal = 0;
    for (let i = 0; i < loan.termWeeks; i++) {
      const split = applyWeeklyPayment(loan);
      totalInterest += split.interest;
      totalPrincipal += split.principal;
      loan.balance = split.newBalance;
      loan.weeksRemaining -= 1;
    }
    expect(loan.balance).toBeCloseTo(0, 1);
    expect(totalPrincipal).toBeCloseTo(100_000, 0);
    expect(totalInterest).toBeGreaterThan(0);
  });

  it("computes a sane weekly payment for a typical bank loan", () => {
    const loan = makeLoan({ id: "l2", lender: "Test Bank", principal: 250_000, annualRate: 0.084, termWeeks: 364, startWeek: 0 });
    expect(loan.weeklyPayment).toBeGreaterThan(0);
    expect(loan.weeklyPayment * loan.termWeeks).toBeGreaterThan(loan.originalPrincipal);
  });
});
