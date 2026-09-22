export const FINANCIAL_GLOSSARY: Record<string, string> = {
  revenue: "Total sales recognized during the period — the price customers agreed to pay times the units they bought. Recognized when the sale happens, not necessarily when you're paid.",
  cogs: "Cost of Goods Sold — the cost directly tied to producing whatever was actually sold this period: raw materials, direct production labor, and manufacturing overhead. It does not include rent, marketing, or admin salaries.",
  "gross-profit": "Revenue minus COGS. What's left after covering the direct cost of making what you sold, before any overhead.",
  "gross-margin": "Gross profit as a percentage of revenue. Higher means more of each sales dollar is left after direct production cost.",
  "operating-expenses": "Costs of running the business that aren't directly part of producing the goods sold — salaries for non-production staff, rent, utilities, marketing, insurance, recruiting, and similar overhead.",
  "operating-income": "Gross profit minus operating expenses. What the core business earned before interest and taxes.",
  "interest-expense": "The cost of borrowed money — interest owed on loans and notes payable this period.",
  "net-income": "Everything left after COGS, operating expenses, interest, and taxes. The bottom line.",
  cash: "Money actually in the bank right now. Different from profit — a profitable company can still run low on cash if customers haven't paid yet or if it's spent cash building inventory.",
  "accounts-receivable": "Money customers owe you for sales already made but not yet paid for. An asset — real value, but not cash in hand yet.",
  "accounts-payable": "Money you owe suppliers for purchases already made but not yet paid for. A liability — real obligation, but hasn't left your cash yet.",
  inventory: "Raw materials and finished goods sitting in storage — real value on the balance sheet, but cash you've already spent that hasn't come back yet.",
  "cash-flow": "The actual movement of cash in and out — separate from profit, which includes non-cash items like unpaid invoices and inventory buildup.",
  "current-ratio": "Current assets divided by current liabilities — a rough measure of whether you can cover near-term obligations.",
  "gross-vs-net": "Gross profit ignores overhead; net income includes everything. A product can have a great gross margin and the company can still lose money overall if overhead is too high.",
};

export function glossaryText(key: string): string {
  return FINANCIAL_GLOSSARY[key] ?? "";
}
