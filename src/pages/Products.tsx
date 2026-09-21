import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { productAvgUnitCost, productCostBreakdownPct } from "../engine/company";
import { Badge, Button, Card, CardHeading, Table, Td, Th } from "../components/ui";

export default function Products() {
  const game = useGameStore((s) => s.game)!;
  const setProductPrice = useGameStore((s) => s.setProductPrice);
  const setProductCapacityAllocation = useGameStore((s) => s.setProductCapacityAllocation);
  const discontinueProduct = useGameStore((s) => s.discontinueProduct);
  const addProduct = useGameStore((s) => s.addProduct);

  const { company } = game;
  const industry = getIndustryDefinition(company.industryId)!;
  const activeProducts = company.products.filter((p) => p.active);
  const discontinuedProducts = company.products.filter((p) => !p.active);
  const availableTemplates = industry.productTemplates.filter(
    (t) => !company.products.some((p) => p.templateId === t.id && p.active),
  );
  const totalAllocated = activeProducts.reduce((s, p) => s + p.capacityAllocationPct, 0);

  const [newTemplateId, setNewTemplateId] = useState(availableTemplates[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Products ({activeProducts.length} active)</h1>

      {totalAllocated > 1.001 && (
        <Badge tone="bad">Capacity allocation totals {Math.round(totalAllocated * 100)}% — rebalance below, the excess is being clipped in production.</Badge>
      )}

      <div className="flex flex-col gap-4">
        {activeProducts.map((product) => {
          const avgCost = productAvgUnitCost(product);
          const breakdown = productCostBreakdownPct(product);
          const margin = product.priceWeekly > 0 ? ((product.priceWeekly - avgCost) / product.priceWeekly) * 100 : 0;
          return (
            <Card key={product.id}>
              <div className="mb-3 flex items-start justify-between">
                <CardHeading subtitle={`SKU ${product.sku} · sold by the ${product.unitLabel}`}>{product.name}</CardHeading>
                {activeProducts.length > 1 && (
                  <Button variant="danger" onClick={() => discontinueProduct(product.id)}>
                    Discontinue
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${product.priceWeekly.toFixed(2)}</span>
                    <span className="text-xs text-ink-400">per {product.unitLabel}</span>
                  </div>
                  <input
                    type="range"
                    min={avgCost * 0.8 || product.priceWeekly * 0.5}
                    max={avgCost * 2.2 || product.priceWeekly * 2.5 || 100}
                    step={0.25}
                    value={product.priceWeekly}
                    onChange={(e) => setProductPrice(product.id, Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  {product.inventoryUnits > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-ink-300">
                      <div>Avg. unit cost: <span className="font-semibold">${avgCost.toFixed(2)}</span></div>
                      <div>Implied margin: <span className={`font-semibold ${margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{margin.toFixed(1)}%</span></div>
                      <div>Materials {(breakdown.materials * 100).toFixed(0)}%</div>
                      <div>Labor {(breakdown.labor * 100).toFixed(0)}%</div>
                      <div>Overhead {(breakdown.overhead * 100).toFixed(0)}%</div>
                      <div>Reference market price: ${product.referenceMarketPrice.toFixed(2)}</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-ink-500">No finished-goods inventory right now — cost basis will reappear after the next production run.</div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-ink-400">
                    Capacity allocation: <span className="font-semibold text-ink-100">{Math.round(product.capacityAllocationPct * 100)}%</span> of facility capacity
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={product.capacityAllocationPct}
                      onChange={(e) => setProductCapacityAllocation(product.id, Number(e.target.value))}
                      className="mt-2 w-full"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-400">
                    <div>Inventory: <span className="text-ink-100">{Math.round(product.inventoryUnits)}</span></div>
                    <div>Sold last wk: <span className="text-ink-100">{Math.round(product.unitsSoldLastWeek)}</span></div>
                    <div>Unmet demand: <span className="text-ink-100">{Math.round(product.unitsUnfulfilledLastWeek)}</span></div>
                  </div>
                  <div className="mt-2 text-xs text-ink-500">
                    {company.customers.filter((c) => c.productId === product.id).length} contracted account(s) buy this product.
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeading subtitle="Diversification adds volume and spreads risk, but each line competes for the same finite capacity and raw materials — it isn't free.">
          Launch a New Product Line
        </CardHeading>
        {availableTemplates.length === 0 ? (
          <p className="text-sm text-ink-400">Every product this industry supports is already active.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Product
              <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} className="mt-1 block rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            {(() => {
              const t = availableTemplates.find((x) => x.id === newTemplateId);
              return t ? (
                <div className="max-w-md text-xs text-ink-400">
                  {t.description} Suggested price ${t.suggestedUnitPrice.toFixed(2)}/{t.unitLabel}.
                </div>
              ) : null;
            })()}
            <Button onClick={() => newTemplateId && addProduct(newTemplateId)} disabled={!newTemplateId}>
              Launch Product
            </Button>
          </div>
        )}
      </Card>

      {discontinuedProducts.length > 0 && (
        <Card>
          <CardHeading>Discontinued Products</CardHeading>
          <Table>
            <thead><tr><Th>Name</Th><Th align="right">Remaining Inventory</Th><Th align="right">Discontinued Week</Th></tr></thead>
            <tbody>
              {discontinuedProducts.map((p) => (
                <tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td align="right">{Math.round(p.inventoryUnits)}</Td>
                  <Td align="right">{p.discontinuedWeek}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-ink-500">Remaining inventory on discontinued lines still sells off automatically until it's gone.</p>
        </Card>
      )}
    </div>
  );
}
