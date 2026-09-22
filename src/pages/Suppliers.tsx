import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { Badge, Button, Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Suppliers() {
  const game = useGameStore((s) => s.game)!;
  const setSupplierAllocation = useGameStore((s) => s.setSupplierAllocation);
  const addSupplier = useGameStore((s) => s.addSupplier);
  const removeSupplier = useGameStore((s) => s.removeSupplier);
  const industry = getIndustryDefinition(game.company.industryId)!;

  const usedNames = new Set(game.company.suppliers.map((s) => s.name));
  const availableTemplates = industry.supplierTemplates.filter((t) => !usedNames.has(t.name));
  const totalAllocation = game.company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Suppliers</h1>
      {game.company.suppliers.length === 0 && (
        <Card className="border-amber-700/60 bg-amber-950/20">
          <p className="text-sm text-amber-300">
            You don't have a raw-material source yet, so production can't run. Pick a supplier below to establish your first relationship — you can always add more later to diversify.
          </p>
        </Card>
      )}
      {game.company.suppliers.length > 0 && (
        <Card>
          <CardHeading subtitle="Split your purchasing across suppliers with the sliders below. A disruption only hits the share of business that supplier actually handles — diversifying spend matters, not just adding a name to the list.">
            Current Relationships
          </CardHeading>
        <Table>
          <thead>
            <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th><Th align="right">Allocation</Th><Th></Th></tr>
          </thead>
          <tbody>
            {game.company.suppliers.map((s) => (
              <tr key={s.id}>
                <Td>{s.name} {s.isPrimary && <Badge tone="good">Largest</Badge>}</Td>
                <Td align="right">${s.pricePerUnit.toFixed(2)}</Td>
                <Td align="right">{Math.round(s.quality * 100)}%</Td>
                <Td align="right">{Math.round(s.reliability * 100)}%</Td>
                <Td align="right">{s.paymentTermsDays}d</Td>
                <Td align="right">{s.leadTimeWeeks}wk</Td>
                <Td align="right" className="w-40">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={s.purchaseAllocationPct}
                      onChange={(e) => setSupplierAllocation(s.id, Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="w-10 tabular-nums">{Math.round(s.purchaseAllocationPct * 100)}%</span>
                  </div>
                </Td>
                <Td align="right">
                  {game.company.suppliers.length > 1 && (
                    <Button variant="ghost" onClick={() => removeSupplier(s.id)}>Drop</Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className={`mt-2 text-xs ${Math.abs(totalAllocation - 1) > 0.02 ? "text-amber-400" : "text-ink-500"}`}>
          Total allocation: {Math.round(totalAllocation * 100)}% {Math.abs(totalAllocation - 1) > 0.02 && "— should sum to 100%; purchasing will scale to whatever this actually adds up to."}
        </div>
        {game.company.suppliers.length === 1 && (
          <p className="mt-3 text-xs text-amber-400">You're single-sourced on pulp. A supplier disruption event will hit at full severity.</p>
        )}
        </Card>
      )}

      <Card>
        <CardHeading subtitle={game.company.suppliers.length === 0 ? "Your first supplier will handle 100% of purchasing — add more later to diversify." : "Adding a supplier immediately takes 25% of purchasing allocation from your existing supplier(s) — rebalance with the sliders above afterward."}>
          {game.company.suppliers.length === 0 ? "Choose Your First Supplier" : "Add a Supplier"}
        </CardHeading>
        {availableTemplates.length === 0 ? (
          <p className="text-sm text-ink-400">You're already working with every known supplier in this market.</p>
        ) : (
          <Table>
            <thead>
              <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th><Th></Th></tr>
            </thead>
            <tbody>
              {availableTemplates.map((t) => (
                <tr key={t.id}>
                  <Td>{t.name}</Td>
                  <Td align="right">${t.pricePerUnit.toFixed(2)}</Td>
                  <Td align="right">{Math.round(t.quality * 100)}%</Td>
                  <Td align="right">{Math.round(t.reliability * 100)}%</Td>
                  <Td align="right">{t.paymentTermsDays}d</Td>
                  <Td align="right">{t.leadTimeWeeks}wk</Td>
                  <Td align="right"><Button onClick={() => addSupplier(t.id)}>Add</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
