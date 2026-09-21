import { useGameStore } from "../store/useGameStore";
import { Badge, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

export default function Competitors() {
  const game = useGameStore((s) => s.game)!;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Competitors</h1>
      <Card>
        <CardHeading subtitle="Prices are public. Market share below is your team's best estimate, not exact — real businesses don't know a rival's books.">
          Known Competitors
        </CardHeading>
        <Table>
          <thead>
            <tr><Th>Company</Th><Th>Strategy</Th><Th align="right">Price</Th><Th align="right">Est. Capacity</Th><Th align="right">Est. Market Share</Th><Th>Health</Th></tr>
          </thead>
          <tbody>
            {game.competitors.map((c) => (
              <tr key={c.id}>
                <Td>{c.name}</Td>
                <Td className="text-ink-400">{c.strategy.replace(/-/g, " ")}</Td>
                <Td align="right">${c.price.toFixed(2)}</Td>
                <Td align="right">{Math.round(c.capacityUnits * 0.9).toLocaleString()}–{Math.round(c.capacityUnits * 1.1).toLocaleString()}</Td>
                <Td align="right">{Math.max(0, Math.round((c.marketShareEstimate - 0.03) * 100))}–{Math.round((c.marketShareEstimate + 0.03) * 100)}%</Td>
                <Td className="w-32">
                  <ProgressBar value={c.financialHealth} tone={c.financialHealth > 60 ? "good" : c.financialHealth > 30 ? "warn" : "bad"} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {game.competitors.length === 0 && <p className="text-sm text-ink-400">No known competitors remain active in this market.</p>}
      </Card>

      {game.recentEventLog.length > 0 && (
        <Card>
          <CardHeading>Recent Market Activity</CardHeading>
          <ul className="flex flex-col gap-1 text-sm text-ink-300">
            {game.recentEventLog.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </Card>
      )}
      <Badge tone="info">Competitor bankruptcy, expansion, and price moves are simulated weekly — watch this page over time.</Badge>
    </div>
  );
}
