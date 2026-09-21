import { useGameStore } from "../store/useGameStore";
import { Badge, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

export default function Customers() {
  const game = useGameStore((s) => s.game)!;
  const customers = game.company.customers;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Customers ({customers.length})</h1>
      <Card>
        <CardHeading subtitle="Contracted accounts — losing a large one is a real event, not a rounding error.">Accounts</CardHeading>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th><Th>Segment</Th><Th align="right">Annual Volume</Th><Th align="right">Relationship</Th><Th align="right">Terms</Th><Th align="right">Last Order</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <Td>{c.name}</Td>
                <Td className="text-ink-400">{c.segment.replace(/-/g, " ")}</Td>
                <Td align="right">{c.annualVolumeUnits.toLocaleString()}</Td>
                <Td align="right" className="w-28"><ProgressBar value={c.relationshipStrength} tone={c.relationshipStrength > 60 ? "good" : c.relationshipStrength > 35 ? "warn" : "bad"} /></Td>
                <Td align="right">{c.paymentTermsDays}d</Td>
                <Td align="right">{c.lastOrderWeek ?? "—"}</Td>
                <Td>{c.atRisk ? <Badge tone="bad">At risk</Badge> : <Badge tone="good">Healthy</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
