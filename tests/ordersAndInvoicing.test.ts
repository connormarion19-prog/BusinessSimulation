import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/engine/newGame";
import { advanceWeek } from "../src/engine/clock";
import { trialBalance, accountBalance } from "../src/engine/ledger";
import { addSupplierToCompany } from "../src/engine/suppliers";
import { flagOverdueRecords } from "../src/engine/orderLedger";
import { getIndustryDefinition } from "../src/industries/registry";
import { makeTestCustomer } from "./testHelpers";
import type { NewCompanyParams } from "../src/types/industry";

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

/** Adds a customer directly rather than going through the probabilistic sales-funnel pitch — that
 * mechanic (and its win-rate) is already covered by tests/salesFunnel.test.ts; these tests are about
 * the invoice/order ledger reconciliation, so a deterministic, always-present customer is the right
 * level of test isolation rather than depending on a random prospect's hidden truth + a pitch roll. */
function addTestCustomer(game: ReturnType<typeof createNewGame>) {
  const customer = makeTestCustomer({
    id: "cust-fixed-1",
    name: "Fixed Test Customer",
    productId: game.company.products[0].id,
    locationId: game.company.locationId,
    annualVolumeUnits: 1500,
    paymentTermsDays: 30,
    relationshipStrength: 70,
  });
  game.company.customers.push(customer);
  return customer;
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
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    const customer = addTestCustomer(game);

    for (let i = 0; i < 6; i++) advanceWeek(game);
    const customerInvoices = game.company.invoices.filter((inv) => inv.customerId === customer.id);
    expect(customerInvoices.length).toBeGreaterThan(0);
    for (const inv of customerInvoices) {
      expect(inv.dueWeek).toBe(inv.issuedWeek + Math.ceil(customer.paymentTermsDays / 7));
      expect(inv.amount).toBeGreaterThan(0);
    }
  });

  it("invoices reconcile to real cash collected — total invoiced amountPaid never exceeds total AR credited", () => {
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    addTestCustomer(game);
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
    const game = createNewGame("paper-manufacturing", "Test", baseParams());
    const industry = getIndustryDefinition("paper-manufacturing")!;
    addSupplierToCompany(game.company, industry, "regional-pulp-co", game.week, game.currentDate);
    addTestCustomer(game);
    for (let i = 0; i < 30; i++) advanceWeek(game);
    const paidInvoices = game.company.invoices.filter((inv) => inv.status === "paid");
    expect(paidInvoices.length).toBeGreaterThan(0);
    expect(accountBalance(game.company.entries, "ar", game.week)).toBeGreaterThanOrEqual(-0.5);
  });
});
