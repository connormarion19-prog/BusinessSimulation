import type { Account } from "../types/finance";

export const CHART_OF_ACCOUNTS: Account[] = [
  // Assets
  { id: "cash", name: "Cash", type: "asset", normalSide: "debit" },
  { id: "ar", name: "Accounts Receivable", type: "asset", normalSide: "debit" },
  { id: "raw-materials", name: "Raw Materials Inventory", type: "asset", normalSide: "debit" },
  { id: "finished-goods", name: "Finished Goods Inventory", type: "asset", normalSide: "debit" },
  { id: "prepaid-expenses", name: "Prepaid Expenses", type: "asset", normalSide: "debit" },
  { id: "ppe", name: "Property, Plant & Equipment", type: "asset", normalSide: "debit" },
  { id: "accum-depreciation", name: "Accumulated Depreciation", type: "asset", normalSide: "credit" },

  // Liabilities
  { id: "ap", name: "Accounts Payable", type: "liability", normalSide: "credit" },
  { id: "accrued-payroll", name: "Accrued Payroll", type: "liability", normalSide: "credit" },
  { id: "accrued-interest", name: "Accrued Interest", type: "liability", normalSide: "credit" },
  { id: "taxes-payable", name: "Taxes Payable", type: "liability", normalSide: "credit" },
  { id: "notes-payable", name: "Notes Payable", type: "liability", normalSide: "credit" },

  // Equity
  { id: "owner-contributions", name: "Owner Contributions / Paid-In Capital", type: "equity", normalSide: "credit" },
  { id: "retained-earnings", name: "Retained Earnings", type: "equity", normalSide: "credit" },
  { id: "distributions", name: "Owner Distributions", type: "equity", normalSide: "debit" },

  // Revenue
  { id: "sales-revenue", name: "Sales Revenue", type: "revenue", normalSide: "credit" },
  { id: "other-income", name: "Other Income", type: "revenue", normalSide: "credit" },

  // COGS
  { id: "cogs-materials", name: "Raw Materials Used", type: "expense", normalSide: "debit" },
  { id: "cogs-labor", name: "Direct Labor", type: "expense", normalSide: "debit" },
  { id: "cogs-overhead", name: "Manufacturing Overhead", type: "expense", normalSide: "debit" },
  { id: "cogs-depreciation", name: "Depreciation — Production", type: "expense", normalSide: "debit" },

  // Operating expenses
  { id: "salaries-admin", name: "Salaries — Admin & Management", type: "expense", normalSide: "debit" },
  { id: "salaries-sales", name: "Salaries — Sales", type: "expense", normalSide: "debit" },
  { id: "payroll-tax-expense", name: "Payroll Tax Expense", type: "expense", normalSide: "debit" },
  { id: "rent-expense", name: "Rent Expense", type: "expense", normalSide: "debit" },
  { id: "utilities-expense", name: "Utilities Expense", type: "expense", normalSide: "debit" },
  { id: "marketing-expense", name: "Marketing Expense", type: "expense", normalSide: "debit" },
  { id: "insurance-expense", name: "Insurance Expense", type: "expense", normalSide: "debit" },
  { id: "maintenance-expense", name: "Maintenance Expense", type: "expense", normalSide: "debit" },
  { id: "depreciation-admin", name: "Depreciation — Admin", type: "expense", normalSide: "debit" },
  { id: "recruiting-expense", name: "Recruiting Expense", type: "expense", normalSide: "debit" },
  { id: "misc-expense", name: "Miscellaneous Expense", type: "expense", normalSide: "debit" },
  { id: "bad-debt-expense", name: "Bad Debt Expense", type: "expense", normalSide: "debit" },
  { id: "interest-expense", name: "Interest Expense", type: "expense", normalSide: "debit" },
  { id: "income-tax-expense", name: "Income Tax Expense", type: "expense", normalSide: "debit" },
];

export const ACCOUNTS_BY_ID: Record<string, Account> = Object.fromEntries(
  CHART_OF_ACCOUNTS.map((a) => [a.id, a]),
);

export const OPERATING_EXPENSE_ACCOUNT_IDS = [
  "salaries-admin",
  "salaries-sales",
  "payroll-tax-expense",
  "rent-expense",
  "utilities-expense",
  "marketing-expense",
  "insurance-expense",
  "maintenance-expense",
  "depreciation-admin",
  "recruiting-expense",
  "misc-expense",
  "bad-debt-expense",
];

export const COGS_ACCOUNT_IDS = [
  "cogs-materials",
  "cogs-labor",
  "cogs-overhead",
  "cogs-depreciation",
];
