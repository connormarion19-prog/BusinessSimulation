import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { Badge, Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Suppliers() {
  const game = useGameStore((s) => s.game)!;
  const industry = getIndustryDefinition(game.company.industryId)!;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Suppliers</h1>
      <Card>
        <CardHeading subtitle="Relying on a single supplier means a disruption hits you at full force. Diversification is a defense against that.">
          Current Relationships
        </CardHeading>
        <Table>
          <thead>
            <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th><Th>Role</Th></tr>
          </thead>
          <tbody>
            {game.company.suppliers.map((s) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td align="right">${s.pricePerUnit.toFixed(2)}</Td>
                <Td align="right">{Math.round(s.quality * 100)}%</Td>
                <Td align="right">{Math.round(s.reliability * 100)}%</Td>
                <Td align="right">{s.paymentTermsDays}d</Td>
                <Td align="right">{s.leadTimeWeeks}wk</Td>
                <Td>{s.isPrimary ? <Badge tone="good">Primary</Badge> : <Badge>Backup</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {game.company.suppliers.length === 1 && (
          <p className="mt-3 text-xs text-amber-400">You're single-sourced on pulp. A supplier disruption event will hit at full severity.</p>
        )}
      </Card>

      <Card>
        <CardHeading>Available Suppliers in this Industry</CardHeading>
        <Table>
          <thead>
            <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th></tr>
          </thead>
          <tbody>
            {industry.supplierTemplates.map((s) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td align="right">${s.pricePerUnit.toFixed(2)}</Td>
                <Td align="right">{Math.round(s.quality * 100)}%</Td>
                <Td align="right">{Math.round(s.reliability * 100)}%</Td>
                <Td align="right">{s.paymentTermsDays}d</Td>
                <Td align="right">{s.leadTimeWeeks}wk</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-ink-500">Switching or adding a second supplier is coming in a future update — for now your founding supplier is locked in.</p>
      </Card>
    </div>
  );
}
