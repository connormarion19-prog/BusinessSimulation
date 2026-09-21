import type { JournalEntry } from "../types/finance";
import type { NewCompanyParams } from "../types/industry";
import type { Ownership } from "../types/core";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { makeLoan } from "./loans";
import type { Loan } from "../types/finance";
import { FINANCING_SOURCES_BY_ID } from "../data/financingSources";

export function buildFoundingEntries(params: NewCompanyParams): { entries: JournalEntry[]; loan?: Loan; ownership: Ownership } {
  const source = FINANCING_SOURCES_BY_ID[params.financingSourceId];
  const entries: JournalEntry[] = [];
  let loan: Loan | undefined;
  const ownership: Ownership = { founderEquityPct: 100, stakeholders: [] };

  if (source?.structure === "loan" && params.loanTerms) {
    loan = makeLoan({
      id: "founding-loan",
      lender: params.loanTerms.lender,
      principal: params.loanTerms.principal,
      annualRate: params.loanTerms.annualRate,
      termWeeks: params.loanTerms.termWeeks,
      startWeek: params.foundedWeek,
    });
    entries.push(
      makeEntry({
        week: params.foundedWeek,
        date: params.foundedDate,
        memo: `Loan proceeds from ${params.loanTerms.lender}`,
        source: "loan-draw",
        lines: [dr("cash", loan.originalPrincipal), cr("notes-payable", loan.originalPrincipal)],
        cashFlowCategory: "financing",
      }),
    );
    const remainder = round2(params.startingCash - loan.originalPrincipal);
    if (remainder > 0.5) {
      entries.push(
        makeEntry({
          week: params.foundedWeek,
          date: params.foundedDate,
          memo: "Founder cash contribution",
          source: "owner-contribution",
          lines: [dr("cash", remainder), cr("owner-contributions", remainder)],
          cashFlowCategory: "financing",
        }),
      );
    }
  } else if (source?.structure === "equity" && params.investorEquityPct) {
    entries.push(
      makeEntry({
        week: params.foundedWeek,
        date: params.foundedDate,
        memo: `Investment from ${source.name}`,
        source: "equity-investment",
        lines: [dr("cash", params.startingCash), cr("owner-contributions", params.startingCash)],
        cashFlowCategory: "financing",
      }),
    );
    ownership.founderEquityPct = round2(100 - params.investorEquityPct);
    ownership.stakeholders.push({ name: source.name, type: "investor", equityPct: params.investorEquityPct });
  } else {
    entries.push(
      makeEntry({
        week: params.foundedWeek,
        date: params.foundedDate,
        memo: "Founder cash contribution",
        source: "owner-contribution",
        lines: [dr("cash", params.startingCash), cr("owner-contributions", params.startingCash)],
        cashFlowCategory: "financing",
      }),
    );
  }

  return { entries, loan, ownership };
}
