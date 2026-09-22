import type { Bill, Company, Invoice, PurchaseOrder, SalesOrder } from "../types/core";
import { round2 } from "./ledger";

let orderCounter = 0;
function nextOrderId(prefix: string): string {
  orderCounter += 1;
  return `${prefix}-${orderCounter}-${Math.round(Math.random() * 1e6)}`;
}

/** Real, discrete order + invoice records for a named customer's fulfilled sale this week — separate from
 * the recurring weekly-demand mechanic that decides HOW MUCH they buy. Never posts its own journal entries;
 * the GL side of the sale is already posted by the caller using the same dollar amount. */
export function recordSalesOrderAndInvoice(
  company: Company,
  params: { customerId: string; customerName: string; productId: string; quantity: number; unitPrice: number; week: number; date: string; paymentTermsDays: number },
): { order: SalesOrder; invoice: Invoice } {
  const amount = round2(params.quantity * params.unitPrice);
  const order: SalesOrder = {
    id: nextOrderId("so"),
    customerId: params.customerId,
    customerName: params.customerName,
    productId: params.productId,
    quantity: round2(params.quantity),
    unitPrice: params.unitPrice,
    week: params.week,
    date: params.date,
    status: "delivered",
  };
  const invoice: Invoice = {
    id: nextOrderId("inv"),
    orderId: order.id,
    customerId: params.customerId,
    customerName: params.customerName,
    amount,
    amountPaid: 0,
    issuedWeek: params.week,
    issuedDate: params.date,
    dueWeek: params.week + Math.ceil(params.paymentTermsDays / 7),
    status: "outstanding",
  };
  order.invoiceId = invoice.id;
  company.salesOrders.push(order);
  company.invoices.push(invoice);
  return { order, invoice };
}

/** Real, discrete purchase order + bill records for a supplier delivery this week. */
export function recordPurchaseOrderAndBill(
  company: Company,
  params: { supplierId: string; supplierName: string; quantity: number; unitPrice: number; week: number; date: string; paymentTermsDays: number },
): { po: PurchaseOrder; bill: Bill } {
  const amount = round2(params.quantity * params.unitPrice);
  const po: PurchaseOrder = {
    id: nextOrderId("po"),
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    quantity: round2(params.quantity),
    unitPrice: params.unitPrice,
    week: params.week,
    date: params.date,
    status: "received",
  };
  const bill: Bill = {
    id: nextOrderId("bill"),
    purchaseOrderId: po.id,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    amount,
    amountPaid: 0,
    issuedWeek: params.week,
    issuedDate: params.date,
    dueWeek: params.week + Math.ceil(params.paymentTermsDays / 7),
    status: "outstanding",
  };
  po.billId = bill.id;
  company.purchaseOrders.push(po);
  company.bills.push(bill);
  return { po, bill };
}

/**
 * Applies the exact dollar amount the weekly simulation already collected via its aggregate AR-balance
 * mechanic against real, individual outstanding invoices — oldest-due first, but weighted so customers
 * with lower paymentReliability tend to sit unpaid longer. This never changes the total dollars collected
 * (that stays governed by the existing, tested weekly.ts mechanic); it just gives the player a real,
 * inspectable per-invoice view of who owes what and how overdue it is, reconciled to the true cash figure.
 */
export function reconcileInvoicePayments(company: Company, week: number, totalCollected: number): void {
  let remaining = round2(totalCollected);
  if (remaining <= 0) return;
  const outstanding = company.invoices
    .filter((i) => i.status === "outstanding" || i.status === "partially-paid" || i.status === "overdue")
    .sort((a, b) => {
      const custA = company.customers.find((c) => c.id === a.customerId);
      const custB = company.customers.find((c) => c.id === b.customerId);
      const reliabilityA = custA?.paymentReliability ?? 70;
      const reliabilityB = custB?.paymentReliability ?? 70;
      // Mostly oldest-first, but a meaningfully less reliable payer tends to lag behind an equally-aged, more reliable one.
      return a.issuedWeek - b.issuedWeek || reliabilityB - reliabilityA;
    });
  for (const invoice of outstanding) {
    if (remaining <= 0.005) break;
    const owed = round2(invoice.amount - invoice.amountPaid);
    if (owed <= 0.005) continue;
    const pay = Math.min(owed, remaining);
    invoice.amountPaid = round2(invoice.amountPaid + pay);
    remaining = round2(remaining - pay);
    if (invoice.amount - invoice.amountPaid <= 0.005) {
      invoice.status = "paid";
      invoice.paidWeek = week;
    } else {
      invoice.status = "partially-paid";
    }
  }
}

/** Same reconciliation, mirrored for supplier bills against the existing aggregate AP-payment mechanic. */
export function reconcileBillPayments(company: Company, week: number, totalPaid: number): void {
  let remaining = round2(totalPaid);
  if (remaining <= 0) return;
  const outstanding = company.bills
    .filter((b) => b.status === "outstanding" || b.status === "partially-paid" || b.status === "overdue")
    .sort((a, b) => a.issuedWeek - b.issuedWeek);
  for (const bill of outstanding) {
    if (remaining <= 0.005) break;
    const owed = round2(bill.amount - bill.amountPaid);
    if (owed <= 0.005) continue;
    const pay = Math.min(owed, remaining);
    bill.amountPaid = round2(bill.amountPaid + pay);
    remaining = round2(remaining - pay);
    if (bill.amount - bill.amountPaid <= 0.005) {
      bill.status = "paid";
      bill.paidWeek = week;
    } else {
      bill.status = "partially-paid";
    }
  }
}

/** Flags anything past its due date and not fully paid as overdue — purely a display/decision-queue signal. */
export function flagOverdueRecords(company: Company, week: number): void {
  for (const invoice of company.invoices) {
    if ((invoice.status === "outstanding" || invoice.status === "partially-paid") && invoice.dueWeek < week) {
      invoice.status = "overdue";
    }
  }
  for (const bill of company.bills) {
    if ((bill.status === "outstanding" || bill.status === "partially-paid") && bill.dueWeek < week) {
      bill.status = "overdue";
    }
  }
}

/** Bounded history so long-running saves don't grow these arrays forever — keeps the most recent N of each. */
export function trimOrderLedgers(company: Company, keep = 400): void {
  if (company.invoices.length > keep) company.invoices = company.invoices.slice(-keep);
  if (company.salesOrders.length > keep) company.salesOrders = company.salesOrders.slice(-keep);
  if (company.bills.length > keep) company.bills = company.bills.slice(-keep);
  if (company.purchaseOrders.length > keep) company.purchaseOrders = company.purchaseOrders.slice(-keep);
}
