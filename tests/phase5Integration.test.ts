import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance, accountBalance } from "../src/engine/ledger";
import { balanceSheetAsOf, incomeStatementForRange } from "../src/engine/reports";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { negotiateSupplierTerms } from "../src/engine/supplierNegotiation";
import { contactProspect, qualifyProspect, pitchProspect, acceptProspectCounterOffer, researchProspect } from "../src/engine/prospecting";
import { getIndustryDefinition } from "../src/industries/registry";
import type { NewCompanyParams } from "../src/types/industry";
import type { CustomerPitch, Prospect } from "../src/types/core";

function statusOf(p: Prospect): string {
  return p.status;
}

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Integration Test Co.",
    difficulty: "realistic",
    locationId: "wi-greenbay",
    financingSourceId: "personal-savings",
    startingCash: 20_000,
    targetCustomerSegmentId: "regional-distributors",
    productTemplateId: "copy-paper",
    facilityTemplateId: "small-job-shop",
    foundedWeek: 0,
    foundedDate: "2025-01-06",
    ...overrides,
  };
}

/** Walks a prospect all the way through the real funnel (contact -> qualify -> pitch, with a
 * negotiation fallback), returning true once an actual CustomerAccount exists. Bounded so a run of
 * bad luck fails the test loudly rather than looping forever. */
function pursueUntilWonOrGiveUp(game: ReturnType<typeof createNewGame>, prospect: Prospect, productId: string): boolean {
  researchProspect(game.company, prospect.id, game.week, game.currentDate);
  for (let i = 0; i < 6 && statusOf(prospect) !== "interested" && statusOf(prospect) !== "lost"; i++) {
    const r = contactProspect(game.company, prospect.id, "in-person-meeting", 1.4, game.week, game.currentDate, game.rng);
    game.company.entries.push(...r.entries);
  }
  if (statusOf(prospect) !== "interested") return false;

  const q = qualifyProspect(game.company, prospect.id, game.rng);
  if (!q.qualified) return false;

  const pitch: CustomerPitch = {
    productId,
    priceOffered: prospect.trueWillingnessToPayPerUnit * 0.85,
    volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
    paymentTermsDaysOffered: prospect.truePaymentTermsDays + 14,
    contractLengthWeeks: 26,
  };
  for (let i = 0; i < 6; i++) {
    if (statusOf(prospect) === "negotiation") {
      const accept = acceptProspectCounterOffer(game.company, prospect.id, productId, game.week, game.currentDate);
      game.company.entries.push(...accept.entries);
      if (accept.won) return true;
    }
    const result = pitchProspect(game.company, prospect.id, pitch, 1.5, 1.0, game.week, game.currentDate, game.rng);
    game.company.entries.push(...result.entries);
    if (result.won) return true;
    if (statusOf(prospect) === "lost") return false;
  }
  return statusOf(prospect) === "negotiation"
    ? (() => {
        const accept = acceptProspectCounterOffer(game.company, prospect.id, productId, game.week, game.currentDate);
        game.company.entries.push(...accept.entries);
        return accept.won === true;
      })()
    : false;
}

describe("Phase 5 end-to-end: find supplier, negotiate, sell, produce, deliver, get paid", () => {
  it("a truly tiny startup builds a real supply chain and a real customer relationship from zero, staying balanced throughout", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;

    // Starting state: nothing but capital and a founder.
    expect(game.company.suppliers).toHaveLength(0);
    expect(game.company.customers).toHaveLength(0);
    expect(game.company.employees).toHaveLength(0);
    expect(game.company.rawMaterialInventoryUnits).toBe(0);
    expect(game.company.ownership.founderEquityPct).toBe(100);

    // 1. Find a supplier.
    const found = addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    expect(found).toBe(true);
    expect(game.company.suppliers).toHaveLength(1);

    // 2. Negotiate supplier terms.
    const supplier = game.company.suppliers[0];
    const originalPrice = supplier.pricePerUnit;
    const negotiation = negotiateSupplierTerms(
      game.company,
      supplier.id,
      { targetPricePerUnit: originalPrice * 0.97, volumeCommitmentUnits: 50, paymentTermsDaysRequested: supplier.paymentTermsDays },
      1.2,
      game.week,
      game.currentDate,
    );
    expect(negotiation.ok).toBe(true);
    if (negotiation.accepted) expect(supplier.pricePerUnit).toBeLessThan(originalPrice);

    // 3. Order materials happens automatically once a supplier exists — advance a week and confirm a
    // real purchase order + bill were created (this IS "ordering materials": the weekly purchasing
    // loop places and receives a real PO against the negotiated terms).
    advanceWeek(game);
    expect(trialBalance(game.company.entries, game.week).balanced).toBe(true);
    expect(game.company.purchaseOrders.length).toBeGreaterThan(0);
    expect(game.company.bills.length).toBeGreaterThan(0);
    expect(game.company.rawMaterialInventoryUnits).toBeGreaterThan(0);

    // 4/5. Find a customer prospect and negotiate/win the sale through the real funnel. Prospects are
    // seeded across all industry segments at random, some far too small to reliably clear the (real,
    // deliberate) half-unit invoicing threshold within a short test window, and any individual pitch
    // can legitimately fail — so pursue prospects biggest-first, moving to the next one on a dead end,
    // exactly what a real founder chasing their first real account would actually do.
    const productId = game.company.products[0].id;
    const prospectsBySize = [...game.company.prospects].sort(
      (a, b) => (b.estimate.annualVolumeRangeUnits[0] + b.estimate.annualVolumeRangeUnits[1]) - (a.estimate.annualVolumeRangeUnits[0] + a.estimate.annualVolumeRangeUnits[1]),
    );
    let won = false;
    for (const candidate of prospectsBySize) {
      candidate.locationId = game.company.locationId; // stay in the home market this test actually exercises
      if (pursueUntilWonOrGiveUp(game, candidate, productId)) {
        won = true;
        break;
      }
    }
    expect(won, "expected at least one of the seeded prospects to be won through the real funnel").toBe(true);
    // Exactly one customer exists at this point — the one just won through the funnel above. A rare,
    // independent "Large Customer Opportunity" event could still add a second one during the weekly
    // simulation loop below, which is legitimate simulation behavior, not something this test controls.
    expect(game.company.customers.length).toBe(1);
    const customer = game.company.customers[0];

    // 6-9. Produce, deliver, invoice, and receive payment: all happen through the real weekly
    // simulation loop, which we let run for a meaningful stretch, checking real invariants throughout.
    let sawProduction = false;
    let sawInvoice = false;
    let sawInvoicePaid = false;
    for (let i = 0; i < 20; i++) {
      advanceWeek(game);
      expect(trialBalance(game.company.entries, game.week).balanced, `unbalanced at week ${game.week}`).toBe(true);
      const bs = balanceSheetAsOf(game.company.entries, game.week);
      expect(bs.balances, `balance sheet imbalance at week ${game.week}`).toBe(true);
      if (game.company.products[0].unitsProducedLastWeek > 0) sawProduction = true;
      if (game.company.invoices.some((inv) => inv.customerId === customer.id)) sawInvoice = true;
      if (game.company.invoices.some((inv) => inv.customerId === customer.id && inv.status === "paid")) sawInvoicePaid = true;
    }
    expect(sawProduction, "expected real production to occur at some point").toBe(true);
    expect(sawInvoice, "expected a real invoice for the won customer").toBe(true);
    expect(sawInvoicePaid, "expected at least one of that customer's invoices to actually get paid").toBe(true);

    // 10. Pay supplier — real bills should have been paid down over this stretch too.
    expect(game.company.bills.some((b) => b.status === "paid")).toBe(true);

    // 11-13. COGS, gross profit, and net income are all real, computed figures — sanity-check they
    // reconcile with each other for the trailing window, not just individually plausible.
    const is = incomeStatementForRange(game.company.entries, game.week - 4, game.week, "trailing");
    expect(is.grossProfit).toBeCloseTo(is.revenue - is.cogs, 1);
    expect(is.netIncome).toBeCloseTo(is.incomeBeforeTax - is.taxExpense, 1);
    expect(Number.isFinite(is.netIncome)).toBe(true);

    // 14. Cash is a real, coherent number.
    const cash = accountBalance(game.company.entries, "cash", game.week);
    expect(Number.isFinite(cash)).toBe(true);

    // 15. Verify the accounting identity one final time, explicitly.
    const finalTb = trialBalance(game.company.entries, game.week);
    expect(finalTb.totalDebits).toBeCloseTo(finalTb.totalCredits, 1);
    expect(finalTb.balanced).toBe(true);

    // The story is real: first supplier, first customer, and (very likely, given real production and
    // sales occurred) a first commercial sale are all in company history, not just game state.
    expect(game.company.historyLog.some((h) => h.headline.includes("as a supplier"))).toBe(true);
    expect(game.company.historyLog.some((h) => h.headline === "First customer signed")).toBe(true);
  });
});
