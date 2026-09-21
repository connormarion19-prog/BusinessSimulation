import type { Loan } from "../types/finance";

/** Standard amortizing weekly payment for a fixed-rate loan. */
export function weeklyPaymentFor(principal: number, annualRate: number, termWeeks: number): number {
  const weeklyRate = annualRate / 52;
  if (weeklyRate === 0) return principal / termWeeks;
  const payment = (principal * weeklyRate) / (1 - Math.pow(1 + weeklyRate, -termWeeks));
  return Math.round(payment * 100) / 100;
}

export function makeLoan(params: {
  id: string;
  lender: string;
  principal: number;
  annualRate: number;
  termWeeks: number;
  startWeek: number;
  originationFee?: number;
}): Loan {
  return {
    id: params.id,
    lender: params.lender,
    originalPrincipal: params.principal,
    balance: params.principal,
    annualRate: params.annualRate,
    termWeeks: params.termWeeks,
    weeklyPayment: weeklyPaymentFor(params.principal, params.annualRate, params.termWeeks),
    weeksRemaining: params.termWeeks,
    startWeek: params.startWeek,
    originationFee: params.originationFee,
  };
}

export interface LoanPaymentSplit {
  interest: number;
  principal: number;
  payment: number;
  newBalance: number;
}

/** One weekly amortization step. The final payment sweeps any rounding residual. */
export function applyWeeklyPayment(loan: Loan): LoanPaymentSplit {
  const weeklyRate = loan.annualRate / 52;
  const interest = Math.round(loan.balance * weeklyRate * 100) / 100;
  let payment = loan.weeklyPayment;
  let principal = Math.round((payment - interest) * 100) / 100;
  if (loan.weeksRemaining <= 1 || principal >= loan.balance) {
    principal = loan.balance;
    payment = Math.round((principal + interest) * 100) / 100;
  }
  const newBalance = Math.round((loan.balance - principal) * 100) / 100;
  return { interest, principal, payment, newBalance };
}
