import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { incomeStatementForRange, balanceSheetAsOf, cashFlowForRange, financialRatios } from "../engine/reports";
import { explainProductEconomics, explainCogsComponents, explainCashVsProfit, explainLoss, computeCashRunwayWarning } from "../engine/financialExplain";
import { ACCOUNTS_BY_ID } from "../data/chartOfAccounts";
import { formatMoney, formatMoneyPrecise } from "../engine/dateUtils";
import { Card, CardHeading, Table, Td, Badge, InfoTip } from "../components/ui";

export default function Finance() {
  const game = useGameStore((s) => s.game)!;
  const [range, setRange] = useState<4 | 13 | 52>(13);
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false);
  const [showCogsBreakdown, setShowCogsBreakdown] = useState(false);
  const startWeek = Math.max(0, game.week - range + 1);

  const is = incomeStatementForRange(game.company.entries, startWeek, game.week, `Last ${range} weeks`);
  const bs = balanceSheetAsOf(game.company.entries, game.week);
  const cf = cashFlowForRange(game.company.entries, startWeek, game.week, `Last ${range} weeks`);
  const ratios = financialRatios(game.company.entries, game.week);

  const products = explainProductEconomics(game.company, startWeek, game.week);
  const cogsComponents = explainCogsComponents(game.company, startWeek, game.week);
  const cashVsProfit = explainCashVsProfit(game.company, startWeek, game.week);
  const loss = explainLoss(game.company, game.week);
  const runway = computeCashRunwayWarning(game.company, game.week);

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

      {loss.isLosing && (
        <Card className="border-rose-800/60 bg-rose-950/20">
          <CardHeading subtitle="Grounded in this week's actual numbers, not a vague warning.">Why Are We Losing Money?</CardHeading>
          <p className="text-sm text-rose-200">{loss.narrative}</p>
        </Card>
      )}

      {game.lastRevenueCausal && game.lastProfitCausal && (
        <Card>
          <CardHeading subtitle="What actually drove last week's revenue and profit change — computed from real price/volume/cost deltas, not a guess.">
            What Changed Last Week?
          </CardHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-ink-400">Revenue {game.lastRevenueCausal.totalChange >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(game.lastRevenueCausal.totalChange))}</div>
              {game.lastRevenueCausal.drivers.map((d) => (
                <div key={d.label} className="flex justify-between text-xs text-ink-300">
                  <span>{d.label}</span>
                  <span className={d.amount >= 0 ? "text-emerald-400" : "text-rose-400"}>{d.amount >= 0 ? "+" : ""}{formatMoney(d.amount)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-ink-400">Profit {game.lastProfitCausal.totalChange >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(game.lastProfitCausal.totalChange))}</div>
              {game.lastProfitCausal.drivers.map((d) => (
                <div key={d.label} className="flex justify-between text-xs text-ink-300">
                  <span>{d.label}</span>
                  <span className={d.amount >= 0 ? "text-emerald-400" : "text-rose-400"}>{d.amount >= 0 ? "+" : ""}{formatMoney(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading subtitle={is.periodLabel}>Income Statement</CardHeading>
          <Table>
            <tbody>
              <tr>
                <Td>
                  <button className="text-left hover:underline" onClick={() => setShowRevenueBreakdown(!showRevenueBreakdown)}>Revenue</button>
                  <InfoTip term="revenue" />
                </Td>
                <Td align="right">{formatMoney(is.revenue)}</Td>
              </tr>
              {showRevenueBreakdown && products.map((p) => (
                <tr key={p.productId} className="text-xs text-ink-400">
                  <Td className="pl-4">{p.productName} — {Math.round(p.unitsSold).toLocaleString()} × ${p.avgSellingPrice.toFixed(2)}</Td>
                  <Td align="right">{formatMoney(p.revenue)}</Td>
                </tr>
              ))}
              <tr>
                <Td>
                  <button className="text-left hover:underline" onClick={() => setShowCogsBreakdown(!showCogsBreakdown)}>Cost of Goods Sold</button>
                  <InfoTip term="cogs" />
                </Td>
                <Td align="right">({formatMoney(is.cogs)})</Td>
              </tr>
              {showCogsBreakdown && (
                <>
                  <tr className="text-xs text-ink-400"><Td className="pl-4">Raw materials</Td><Td align="right">({formatMoney(cogsComponents.materials)})</Td></tr>
                  <tr className="text-xs text-ink-400"><Td className="pl-4">Direct production labor</Td><Td align="right">({formatMoney(cogsComponents.labor)})</Td></tr>
                  <tr className="text-xs text-ink-400"><Td className="pl-4">Manufacturing overhead</Td><Td align="right">({formatMoney(cogsComponents.overhead)})</Td></tr>
                  {cogsComponents.freight > 0 && <tr className="text-xs text-ink-400"><Td className="pl-4">Freight</Td><Td align="right">({formatMoney(cogsComponents.freight)})</Td></tr>}
                  {cogsComponents.commission > 0 && <tr className="text-xs text-ink-400"><Td className="pl-4">Distributor commission</Td><Td align="right">({formatMoney(cogsComponents.commission)})</Td></tr>}
                </>
              )}
              <tr className="font-semibold">
                <Td>Gross Profit ({(is.grossMargin * 100).toFixed(1)}%)<InfoTip term="gross-profit" /></Td>
                <Td align="right">{formatMoney(is.grossProfit)}</Td>
              </tr>
              {Object.entries(is.operatingExpenses).map(([id, amt]) => (
                <tr key={id}><Td className="pl-4 text-ink-400">{ACCOUNTS_BY_ID[id]?.name ?? id}</Td><Td align="right">({formatMoney(amt)})</Td></tr>
              ))}
              <tr className="font-semibold"><Td>Operating Income<InfoTip term="operating-income" /></Td><Td align="right">{formatMoney(is.operatingIncome)}</Td></tr>
              <tr><Td>Interest Expense<InfoTip term="interest-expense" /></Td><Td align="right">({formatMoney(is.interestExpense)})</Td></tr>
              <tr><Td>Income Tax Expense</Td><Td align="right">({formatMoney(is.taxExpense)})</Td></tr>
              <tr className="border-t border-ink-600 font-bold"><Td>Net Income<InfoTip term="net-income" /></Td><Td align="right">{formatMoney(is.netIncome)}</Td></tr>
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
          <CardHeading subtitle={cf.periodLabel}>Cash Flow Statement<InfoTip term="cash-flow" /></CardHeading>
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
          <div className="mt-3 rounded-md border border-ink-700 bg-ink-950 p-2.5 text-xs">
            <div className="mb-1 flex items-center font-medium text-ink-300">Cash vs. Profit<InfoTip term="gross-vs-net" text="Profit and cash are different things — profit counts a sale the moment it's made, while cash only moves when money actually changes hands." /></div>
            <p className="text-ink-400">{cashVsProfit.narrative}</p>
          </div>
        </Card>

        <Card>
          <CardHeading>Financial Ratios</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Current Ratio<InfoTip term="current-ratio" /></Td><Td align="right">{ratios.currentRatio ?? "—"}</Td></tr>
              <tr><Td>Quick Ratio</Td><Td align="right">{ratios.quickRatio ?? "—"}</Td></tr>
              <tr><Td>Gross Margin<InfoTip term="gross-margin" /></Td><Td align="right">{ratios.grossMargin ?? "—"}%</Td></tr>
              <tr><Td>Operating Margin</Td><Td align="right">{ratios.operatingMargin ?? "—"}%</Td></tr>
              <tr><Td>Net Margin</Td><Td align="right">{ratios.netMargin ?? "—"}%</Td></tr>
              <tr><Td>Debt / Equity</Td><Td align="right">{ratios.debtToEquity ?? "—"}</Td></tr>
              <tr><Td>Return on Equity</Td><Td align="right">{ratios.returnOnEquity ?? "—"}%</Td></tr>
              <tr><Td>Days Cash on Hand</Td><Td align="right">{ratios.daysCashOnHand ?? "—"}</Td></tr>
            </tbody>
          </Table>
        </Card>
      </div>

      {products.length > 0 && (
        <Card>
          <CardHeading subtitle="Per-product unit economics for this period — sourced directly from the same ledger entries the simulation posts, not a separate estimate.">
            Product Economics
          </CardHeading>
          <Table>
            <thead>
              <tr>
                <td className="border-b border-ink-700 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">Product</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">Units Sold</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">Avg Price</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">Revenue</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">COGS</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">Gross Profit</td>
                <td className="border-b border-ink-700 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-ink-400">Margin</td>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId}>
                  <Td>{p.productName}</Td>
                  <Td align="right">{Math.round(p.unitsSold).toLocaleString()}</Td>
                  <Td align="right">${p.avgSellingPrice.toFixed(2)}</Td>
                  <Td align="right">{formatMoney(p.revenue)}</Td>
                  <Td align="right">({formatMoney(p.totalCogs)})</Td>
                  <Td align="right" className={p.grossProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatMoney(p.grossProfit)}</Td>
                  <Td align="right">{p.grossMarginPct !== null ? `${p.grossMarginPct.toFixed(1)}%` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {runway.weeksOfRunway !== null && (
        <Card className={runway.weeksOfRunway < 8 ? "border-rose-800/60 bg-rose-950/20" : undefined}>
          <CardHeading subtitle="Every component below is a real driver, not an opaque number.">Cash Runway</CardHeading>
          <p className="mb-3 text-sm text-ink-200">{runway.narrative}</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-300 sm:grid-cols-4">
            <div>Payroll: <span className="text-ink-100">{formatMoney(runway.weeklyPayroll)}/wk</span></div>
            <div>Supplier payments: <span className="text-ink-100">{formatMoney(runway.weeklySupplierPayments)}/wk</span></div>
            <div>Debt service: <span className="text-ink-100">{formatMoney(runway.weeklyDebtService)}/wk</span></div>
            <div>Expected collections: <span className="text-ink-100">{formatMoney(runway.weeklyCollections)}/wk</span></div>
          </div>
        </Card>
      )}
    </div>
  );
}
