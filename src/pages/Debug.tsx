import { useGameStore } from "../store/useGameStore";
import { trialBalance } from "../engine/ledger";
import { formatMoney } from "../engine/dateUtils";
import { Badge, Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Debug() {
  const game = useGameStore((s) => s.game)!;
  const tb = trialBalance(game.company.entries, game.week);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Debug &amp; Transparency</h1>
      <p className="text-sm text-ink-400">Every number in this game comes from the transaction ledger below — nothing is hard-coded.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {game.lastRevenueCausal && (
          <Card>
            <CardHeading>Why did revenue change? (last week)</CardHeading>
            <p className="mb-2 text-sm">Total change: <span className="font-semibold">{formatMoney(game.lastRevenueCausal.totalChange)}</span></p>
            <Table>
              <tbody>
                {game.lastRevenueCausal.drivers.map((d) => (
                  <tr key={d.label}><Td>{d.label}</Td><Td align="right">{formatMoney(d.amount)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        {game.lastProfitCausal && (
          <Card>
            <CardHeading>Why did profit change? (last week)</CardHeading>
            <p className="mb-2 text-sm">Total change: <span className="font-semibold">{formatMoney(game.lastProfitCausal.totalChange)}</span></p>
            <Table>
              <tbody>
                {game.lastProfitCausal.drivers.map((d) => (
                  <tr key={d.label}><Td>{d.label}</Td><Td align="right">{formatMoney(d.amount)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      <Card>
        <CardHeading>
          Trial Balance (through week {game.week}) {tb.balanced ? <Badge tone="good">Balanced</Badge> : <Badge tone="bad">NOT BALANCED — engine bug</Badge>}
        </CardHeading>
        <Table>
          <thead><tr><Th>Account</Th><Th align="right">Debit</Th><Th align="right">Credit</Th></tr></thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.accountId}>
                <Td>{r.name}</Td>
                <Td align="right">{r.debit ? formatMoney(r.debit) : ""}</Td>
                <Td align="right">{r.credit ? formatMoney(r.credit) : ""}</Td>
              </tr>
            ))}
            <tr className="border-t border-ink-600 font-bold">
              <Td>Total</Td>
              <Td align="right">{formatMoney(tb.totalDebits)}</Td>
              <Td align="right">{formatMoney(tb.totalCredits)}</Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeading>Recent Journal Entries</CardHeading>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <thead><tr><Th>Week</Th><Th>Memo</Th><Th>Source</Th><Th align="right">Amount</Th></tr></thead>
            <tbody>
              {[...game.company.entries].slice(-60).reverse().map((e) => (
                <tr key={e.id}>
                  <Td>{e.week}</Td>
                  <Td>{e.memo}</Td>
                  <Td className="text-ink-400">{e.source}</Td>
                  <Td align="right">{formatMoney(e.lines.reduce((s, l) => s + l.debit, 0))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
