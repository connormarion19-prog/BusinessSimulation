import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import type { SupplierRelationship } from "../types/core";
import { Badge, Button, Card, CardHeading, Table, Td, Th } from "../components/ui";

function NegotiatePanel({ supplier }: { supplier: SupplierRelationship }) {
  const negotiateSupplierTerms = useGameStore((s) => s.negotiateSupplierTerms);
  const [targetPrice, setTargetPrice] = useState(Math.round(supplier.pricePerUnit * 0.95 * 100) / 100);
  const [volume, setVolume] = useState(Math.max(supplier.minimumOrderUnits, 50));
  const [terms, setTerms] = useState(supplier.paymentTermsDays);
  const [result, setResult] = useState<{ ok: boolean; accepted?: boolean; reason?: string; counterOffer?: { priceAcceptable: number; paymentTermsAcceptable: number; minimumOrderAcceptable: number } } | null>(null);

  return (
    <div className="mt-2 rounded-md border border-ink-700 bg-ink-950 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Negotiate with {supplier.name}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs">
          Target price/unit
          <input type="number" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs">
          Volume commitment (min {supplier.minimumOrderUnits})
          <input type="number" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
        <label className="text-xs">
          Payment terms requested (days)
          <input type="number" value={terms} onChange={(e) => setTerms(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">Current: ${supplier.pricePerUnit.toFixed(2)}/unit, {supplier.paymentTermsDays}-day terms. A relationship can't be renegotiated again for 4 weeks after a successful round.</p>
      <Button
        className="mt-2"
        onClick={() => setResult(negotiateSupplierTerms(supplier.id, { targetPricePerUnit: targetPrice, volumeCommitmentUnits: volume, paymentTermsDaysRequested: terms }))}
      >
        Propose Terms
      </Button>
      {result && (
        <div className="mt-2 text-xs">
          <p className={result.accepted ? "text-emerald-400" : "text-amber-400"}>{result.reason}</p>
          {result.counterOffer && (
            <div className="mt-1.5 rounded-md border border-amber-700/50 bg-amber-950/20 p-2 text-amber-200">
              They'd accept: ${result.counterOffer.priceAcceptable.toFixed(2)}/unit, {result.counterOffer.paymentTermsAcceptable}-day terms, {result.counterOffer.minimumOrderAcceptable}+ unit minimum.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Suppliers() {
  const game = useGameStore((s) => s.game)!;
  const setSupplierAllocation = useGameStore((s) => s.setSupplierAllocation);
  const addSupplier = useGameStore((s) => s.addSupplier);
  const removeSupplier = useGameStore((s) => s.removeSupplier);
  const industry = getIndustryDefinition(game.company.industryId)!;
  const [negotiatingId, setNegotiatingId] = useState<string | null>(null);

  const usedNames = new Set(game.company.suppliers.map((s) => s.name));
  const availableTemplates = industry.supplierTemplates.filter((t) => !usedNames.has(t.name));
  const totalAllocation = game.company.suppliers.reduce((s, sup) => s + sup.purchaseAllocationPct, 0);
  const recentBills = [...game.company.bills].sort((a, b) => b.issuedWeek - a.issuedWeek).slice(0, 15);
  const recentPOs = [...game.company.purchaseOrders].sort((a, b) => b.week - a.week).slice(0, 15);

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
          <CardHeading subtitle="Split your purchasing across suppliers with the sliders below. A disruption only hits the share of business that supplier actually handles — diversifying spend matters, not just adding a name to the list. Negotiate to push price/terms in your favor.">
            Current Relationships
          </CardHeading>
        <Table>
          <thead>
            <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th><Th align="right">Min Order</Th><Th align="right">Allocation</Th><Th></Th></tr>
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
                <Td align="right">{s.minimumOrderUnits}</Td>
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
                  <div className="flex justify-end gap-1.5">
                    <Button variant="secondary" onClick={() => setNegotiatingId(negotiatingId === s.id ? null : s.id)}>
                      {negotiatingId === s.id ? "Close" : "Negotiate"}
                    </Button>
                    {game.company.suppliers.length > 1 && (
                      <Button variant="ghost" onClick={() => removeSupplier(s.id)}>Drop</Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {negotiatingId && (
          <NegotiatePanel supplier={game.company.suppliers.find((s) => s.id === negotiatingId)!} />
        )}
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
              <tr><Th>Supplier</Th><Th align="right">Price</Th><Th align="right">Quality</Th><Th align="right">Reliability</Th><Th align="right">Terms</Th><Th align="right">Lead Time</Th><Th align="right">Min Order</Th><Th></Th></tr>
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
                  <Td align="right">{t.minimumOrderUnits}</Td>
                  <Td align="right"><Button onClick={() => addSupplier(t.id)}>Add</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {(recentPOs.length > 0 || recentBills.length > 0) && (
        <Card>
          <CardHeading subtitle="Every delivery is a real purchase order that becomes a real bill — due on that supplier's own payment terms, not an abstract average.">
            Recent Purchase Orders &amp; Bills
          </CardHeading>
          <Table>
            <thead>
              <tr><Th>Supplier</Th><Th align="right">Qty</Th><Th align="right">Unit Price</Th><Th align="right">Amount</Th><Th align="right">Ordered</Th><Th align="right">Due</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {recentBills.map((b) => (
                <tr key={b.id}>
                  <Td>{b.supplierName}</Td>
                  <Td align="right">{recentPOs.find((p) => p.id === b.purchaseOrderId)?.quantity.toLocaleString() ?? "—"}</Td>
                  <Td align="right">${(recentPOs.find((p) => p.id === b.purchaseOrderId)?.unitPrice ?? 0).toFixed(2)}</Td>
                  <Td align="right">${Math.round(b.amount).toLocaleString()}</Td>
                  <Td align="right">wk {b.issuedWeek}</Td>
                  <Td align="right">wk {b.dueWeek}</Td>
                  <Td>
                    <Badge tone={b.status === "paid" ? "good" : b.status === "overdue" ? "bad" : b.status === "partially-paid" ? "warn" : "neutral"}>{b.status.replace("-", " ")}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
