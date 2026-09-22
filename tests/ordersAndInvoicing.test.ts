import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance, accountBalance } from "../src/engine/ledger";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { pitchProspect } from "../src/engine/prospecting";
import { getIndustryDefinition } from "../src/industries/registry";
import { createRng } from "../src/engine/rng";
import { flagOverdueRecords } from "../src/engine/orderLedger";
import type { NewCompanyParams } from "../src/types/industry";
import type { CustomerPitch } from "../src/types/core";

function baseParams(overrides: Partial<NewCompanyParams> = {}): NewCompanyParams {
  return {
    name: "Micro Startup Co.",
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

function winFirstCustomer(game: ReturnType<typeof createNewGame>, rng: ReturnType<typeof createRng>) {
  const prospect = game.company.prospects[0];
  // Pin the prospect to the home region: a customer outside any market the company has actively
  // entered generates zero demand (a real, pre-existing limitation of regional market entry, not
  // something this test is exercising) — irrelevant noise for testing the invoicing mechanism itself.
  prospect.locationId = game.company.locationId;
  prospect.status = "qualified";
  const pitch: CustomerPitch = {
    productId: game.company.products[0].id,
    priceOffered: prospect.trueWillingnessToPayPerUnit * 0.85,
    volumeCommitmentUnits: prospect.trueAnnualVolumeUnits,
    paymentTermsDaysOffered: prospect.truePaymentTermsDays + 14,
    contractLengthWeeks: 52,
  };
  let result;
  let attempts = 0;
  do {
    const status: string = prospect.status;
    if (status === "negotiation") prospect.status = "qualified";
    result = pitchProspect(game.company, prospect.id, pitch, 1.5, 1.0, game.week, game.currentDate, rng);
    game.company.entries.push(...result.entries);
    attempts++;
  } while (!result.won && attempts < 8 && (prospect.status as string) !== "lost");
  return result.won;
}

describe("purchase orders and bills", () => {
  it("every supplier delivery creates a real, inspectable purchase order and bill with a correct due date", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    advanceWeek(game);
    expect(game.company.purchaseOrders.length).toBeGreaterThan(0);
    expect(game.company.bills.length).toBeGreaterThan(0);
    const bill = game.company.bills[0];
    expect(bill.dueWeek).toBeGreaterThan(bill.issuedWeek);
    expect(bill.amount).toBeGreaterThan(0);
    const po = game.company.purchaseOrders.find((p) => p.id === bill.purchaseOrderId);
    expect(po).toBeDefined();
    expect(po!.status).toBe("received");
  });

  it("bills get paid down over time and eventually reach paid status, without ever exceeding their own amount", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    for (let i = 0; i < 20; i++) advanceWeek(game);
    expect(game.company.bills.length).toBeGreaterThan(0);
    for (const bill of game.company.bills) {
      expect(bill.amountPaid).toBeLessThanOrEqual(bill.amount + 0.01);
    }
    const paidBills = game.company.bills.filter((b) => b.status === "paid");
    expect(paidBills.length).toBeGreaterThan(0);
  });
});

describe("customer orders and invoices", () => {
  it("a contracted customer's fulfilled weekly demand creates a real invoice at their own payment terms", () => {
    const rng = createRng(21);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    const won = winFirstCustomer(game, rng);
    expect(won).toBe(true);
    const customer = game.company.customers[0];

    for (let i = 0; i < 6; i++) advanceWeek(game);
    const customerInvoices = game.company.invoices.filter((inv) => inv.customerId === customer.id);
    expect(customerInvoices.length).toBeGreaterThan(0);
    for (const inv of customerInvoices) {
      expect(inv.dueWeek).toBe(inv.issuedWeek + Math.ceil(customer.paymentTermsDays / 7));
      expect(inv.amount).toBeGreaterThan(0);
    }
  });

  it("invoices reconcile to real cash collected — total invoiced amountPaid never exceeds total AR credited", () => {
    const rng = createRng(22);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    winFirstCustomer(game, rng);
    for (let i = 0; i < 20; i++) advanceWeek(game);

    const totalInvoicedAmountPaid = game.company.invoices.reduce((s, inv) => s + inv.amountPaid, 0);
    const totalArCollected = game.company.entries
      .filter((e) => e.source === "ar-collection")
      .reduce((s, e) => s + (e.lines.find((l) => l.accountId === "cash")?.debit ?? 0), 0);
    // Reconciliation is a best-effort mirror of the real collected dollar figure (some collections may
    // land against spot-market revenue that has no named invoice), so invoiced payments should never exceed it.
    expect(totalInvoicedAmountPaid).toBeLessThanOrEqual(totalArCollected + 0.5);

    const paidInvoices = game.company.invoices.filter((inv) => inv.status === "paid");
    expect(paidInvoices.length).toBeGreaterThan(0);
    const tb = trialBalance(game.company.entries, game.week);
    expect(tb.balanced).toBe(true);
  });

  it("an invoice past its due date and not fully paid is flagged overdue, and a paid one is left alone", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    game.company.invoices.push(
      { id: "inv-a", orderId: "so-a", customerId: "cust-a", customerName: "Overdue Co.", amount: 500, amountPaid: 100, issuedWeek: 1, issuedDate: "2025-01-06", dueWeek: 3, status: "partially-paid" },
      { id: "inv-b", orderId: "so-b", customerId: "cust-b", customerName: "Current Co.", amount: 500, amountPaid: 0, issuedWeek: 9, issuedDate: "2025-03-03", dueWeek: 20, status: "outstanding" },
      { id: "inv-c", orderId: "so-c", customerId: "cust-c", customerName: "Paid Co.", amount: 500, amountPaid: 500, issuedWeek: 1, issuedDate: "2025-01-06", dueWeek: 3, status: "paid" },
    );
    flagOverdueRecords(game.company, 10);
    expect(game.company.invoices.find((i) => i.id === "inv-a")!.status).toBe("overdue");
    expect(game.company.invoices.find((i) => i.id === "inv-b")!.status).toBe("outstanding");
    expect(game.company.invoices.find((i) => i.id === "inv-c")!.status).toBe("paid");
  });

  it("real weekly collections genuinely pay invoices down and eventually clear them, reflected in the AR balance", () => {
    const rng = createRng(23);
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    winFirstCustomer(game, rng);
    for (let i = 0; i < 30; i++) advanceWeek(game);
    const paidInvoices = game.company.invoices.filter((inv) => inv.status === "paid");
    expect(paidInvoices.length).toBeGreaterThan(0);
    expect(accountBalance(game.company.entries, "ar", game.week)).toBeGreaterThanOrEqual(-0.5);
  });
});
