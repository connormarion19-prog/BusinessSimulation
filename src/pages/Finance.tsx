import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { incomeStatementForRange, balanceSheetAsOf, cashFlowForRange, financialRatios } from "../engine/reports";
import { ACCOUNTS_BY_ID } from "../data/chartOfAccounts";
import { formatMoney, formatMoneyPrecise } from "../engine/dateUtils";
import { Card, CardHeading, Table, Td, Badge } from "../components/ui";

export default function Finance() {
  const game = useGameStore((s) => s.game)!;
  const [range, setRange] = useState<4 | 13 | 52>(13);
  const startWeek = Math.max(0, game.week - range + 1);

  const is = incomeStatementForRange(game.company.entries, startWeek, game.week, `Last ${range} weeks`);
  const bs = balanceSheetAsOf(game.company.entries, game.week);
  const cf = cashFlowForRange(game.company.entries, startWeek, game.week, `Last ${range} weeks`);
  const ratios = financialRatios(game.company.entries, game.week);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Finance</h1>
        <div className="flex gap-1">
          {[4, 13, 52].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r as 4 | 13 | 52)}
              className={`rounded-md px-3 py-1 text-xs ${range === r ? "bg-emerald-600 text-white" : "bg-ink-800 text-ink-300"}`}
            >
              {r}wk
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading subtitle={is.periodLabel}>Income Statement</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Revenue</Td><Td align="right">{formatMoney(is.revenue)}</Td></tr>
              <tr><Td>Cost of Goods Sold</Td><Td align="right">({formatMoney(is.cogs)})</Td></tr>
              <tr className="font-semibold"><Td>Gross Profit ({(is.grossMargin * 100).toFixed(1)}%)</Td><Td align="right">{formatMoney(is.grossProfit)}</Td></tr>
              {Object.entries(is.operatingExpenses).map(([id, amt]) => (
                <tr key={id}><Td className="pl-4 text-ink-400">{ACCOUNTS_BY_ID[id]?.name ?? id}</Td><Td align="right">({formatMoney(amt)})</Td></tr>
              ))}
              <tr className="font-semibold"><Td>Operating Income</Td><Td align="right">{formatMoney(is.operatingIncome)}</Td></tr>
              <tr><Td>Interest Expense</Td><Td align="right">({formatMoney(is.interestExpense)})</Td></tr>
              <tr><Td>Income Tax Expense</Td><Td align="right">({formatMoney(is.taxExpense)})</Td></tr>
              <tr className="border-t border-ink-600 font-bold"><Td>Net Income</Td><Td align="right">{formatMoney(is.netIncome)}</Td></tr>
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeading subtitle={`As of week ${game.week}`}>
            Balance Sheet {bs.balances ? <Badge tone="good">Balanced</Badge> : <Badge tone="bad">Out of balance: {formatMoneyPrecise(bs.imbalanceAmount)}</Badge>}
          </CardHeading>
          <Table>
            <tbody>
              <tr className="font-semibold"><Td colSpan={2}>Assets</Td></tr>
              {Object.entries(bs.assets).map(([id, amt]) => (
                <tr key={id}><Td className="pl-4 text-ink-400">{ACCOUNTS_BY_ID[id]?.name}</Td><Td align="right">{formatMoney(amt)}</Td></tr>
              ))}
              <tr className="border-t border-ink-700 font-semibold"><Td>Total Assets</Td><Td align="right">{formatMoney(bs.totalAssets)}</Td></tr>
              <tr className="font-semibold"><Td colSpan={2} className="pt-2">Liabilities</Td></tr>
              {Object.entries(bs.liabilities).map(([id, amt]) => (
                <tr key={id}><Td className="pl-4 text-ink-400">{ACCOUNTS_BY_ID[id]?.name}</Td><Td align="right">{formatMoney(amt)}</Td></tr>
              ))}
              <tr className="border-t border-ink-700 font-semibold"><Td>Total Liabilities</Td><Td align="right">{formatMoney(bs.totalLiabilities)}</Td></tr>
              <tr className="font-semibold"><Td colSpan={2} className="pt-2">Equity</Td></tr>
              {Object.entries(bs.equity).map(([id, amt]) => (
                <tr key={id}><Td className="pl-4 text-ink-400">{ACCOUNTS_BY_ID[id]?.name}</Td><Td align="right">{formatMoney(amt)}</Td></tr>
              ))}
              <tr className="border-t border-ink-700 font-semibold"><Td>Total Equity</Td><Td align="right">{formatMoney(bs.totalEquity)}</Td></tr>
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeading subtitle={cf.periodLabel}>Cash Flow Statement</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Operating Activities</Td><Td align="right">{formatMoney(cf.operating)}</Td></tr>
              <tr><Td>Investing Activities</Td><Td align="right">{formatMoney(cf.investing)}</Td></tr>
              <tr><Td>Financing Activities</Td><Td align="right">{formatMoney(cf.financing)}</Td></tr>
              <tr className="border-t border-ink-600 font-bold"><Td>Net Change in Cash</Td><Td align="right">{formatMoney(cf.netChange)}</Td></tr>
              <tr><Td className="text-ink-400">Beginning Cash</Td><Td align="right">{formatMoney(cf.beginningCash)}</Td></tr>
              <tr><Td className="text-ink-400">Ending Cash</Td><Td align="right">{formatMoney(cf.endingCash)}</Td></tr>
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeading>Financial Ratios</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Current Ratio</Td><Td align="right">{ratios.currentRatio ?? "—"}</Td></tr>
              <tr><Td>Quick Ratio</Td><Td align="right">{ratios.quickRatio ?? "—"}</Td></tr>
              <tr><Td>Gross Margin</Td><Td align="right">{ratios.grossMargin ?? "—"}%</Td></tr>
              <tr><Td>Operating Margin</Td><Td align="right">{ratios.operatingMargin ?? "—"}%</Td></tr>
              <tr><Td>Net Margin</Td><Td align="right">{ratios.netMargin ?? "—"}%</Td></tr>
              <tr><Td>Debt / Equity</Td><Td align="right">{ratios.debtToEquity ?? "—"}</Td></tr>
              <tr><Td>Return on Equity</Td><Td align="right">{ratios.returnOnEquity ?? "—"}%</Td></tr>
              <tr><Td>Days Cash on Hand</Td><Td align="right">{ratios.daysCashOnHand ?? "—"}</Td></tr>
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
