import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { productAvgUnitCost, productCostBreakdownPct, isDepartmentDelegated } from "../engine/company";
import { formatMoney } from "../engine/dateUtils";
import { Card, CardHeading, ProgressBar, Badge } from "../components/ui";

export default function Operations() {
  const game = useGameStore((s) => s.game)!;
  const setProductPrice = useGameStore((s) => s.setProductPrice);
  const setFounderAllocation = useGameStore((s) => s.setFounderAllocation);
  const { company, market } = game;
  const product = company.products.find((p) => p.active) ?? company.products[0];
  const facility = company.facilities[0];

  const [alloc, setAlloc] = useState(company.founderAllocation);
  const allocTotal = alloc.production + alloc.purchasing + alloc.sales + alloc.accounting;

  const avgCost = productAvgUnitCost(product);
  const breakdown = productCostBreakdownPct(product);
  const margin = product.priceWeekly > 0 ? ((product.priceWeekly - avgCost) / product.priceWeekly) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Operations</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading subtitle="Set the price customers see. The market and your own customers respond next week.">Pricing — {product.name}</CardHeading>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">${product.priceWeekly.toFixed(2)}</span>
            <span className="text-xs text-ink-400">per {product.unitLabel}</span>
          </div>
          <input
            type="range"
            min={avgCost * 0.8}
            max={avgCost * 2.2 || 100}
            step={0.25}
            value={product.priceWeekly}
            onChange={(e) => setProductPrice(product.id, Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-300">
            {product.inventoryUnits > 0 ? (
              <>
                <div>Avg. unit cost (weighted avg. inventory): <span className="font-semibold">${avgCost.toFixed(2)}</span></div>
                <div>Implied margin: <span className={`font-semibold ${margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{margin.toFixed(1)}%</span></div>
                <div>Materials share: {(breakdown.materials * 100).toFixed(0)}%</div>
                <div>Labor share: {(breakdown.labor * 100).toFixed(0)}%</div>
                <div>Overhead share: {(breakdown.overhead * 100).toFixed(0)}%</div>
              </>
            ) : (
              <div className="col-span-2 text-ink-500">No finished-goods inventory on hand right now — everything produced last week sold the same week, so there's no cost basis to show until the next production run.</div>
            )}
            <div>Market avg. price: ${market.avgMarketPrice.toFixed(2)}</div>
            <div>Est. regional demand: {Math.round(market.estimatedDemandRangeUnits[0]).toLocaleString()}–{Math.round(market.estimatedDemandRangeUnits[1]).toLocaleString()} {market.unitLabel}s/wk</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-400">
            <div>Inventory on hand: <span className="text-ink-100">{Math.round(product.inventoryUnits)}</span></div>
            <div>Sold last week: <span className="text-ink-100">{Math.round(product.unitsSoldLastWeek)}</span></div>
            <div>Unmet demand: <span className="text-ink-100">{Math.round(product.unitsUnfulfilledLastWeek)}</span></div>
          </div>
        </Card>

        <Card>
          <CardHeading subtitle="Facility & equipment status">{facility.name}</CardHeading>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-400">
                <span>Equipment condition</span>
                <span>{Math.round(facility.condition)}%</span>
              </div>
              <ProgressBar value={facility.condition} tone={facility.condition < 40 ? "bad" : facility.condition < 70 ? "warn" : "good"} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-300">
              <div>Machine capacity: {facility.baseWeeklyCapacityUnits.toLocaleString()} units/wk</div>
              <div>Produced last week: {Math.round(product.unitsProducedLastWeek).toLocaleString()}</div>
              <div>Weekly lease: {formatMoney(facility.weeklyLeaseCost)}</div>
              <div>Weekly utilities (base): {formatMoney(facility.weeklyUtilityBaseCost)}</div>
              <div>Raw material on hand: {Math.round(company.rawMaterialInventoryUnits)} {market.inputLabel}s</div>
              <div>Input price: ${market.inputPricePerUnit.toFixed(2)}/{market.inputLabel}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeading subtitle="How you split your own working time this week. Hiring into a function reduces how much it needs from you.">
          Founder Time Allocation
        </CardHeading>
        <div className="flex flex-col gap-3">
          {(["production", "purchasing", "sales", "accounting"] as const).map((dept) => (
            <div key={dept} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm capitalize">{dept}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={alloc[dept]}
                onChange={(e) => setAlloc({ ...alloc, [dept]: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums">{Math.round(alloc[dept] * 100)}%</span>
              {isDepartmentDelegated(company, dept) && <Badge tone="good">Delegated</Badge>}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className={`text-xs ${allocTotal > 1.001 ? "text-rose-400" : "text-ink-400"}`}>
              Total allocated: {Math.round(allocTotal * 100)}% {allocTotal > 1.001 && "(over 100% — spread too thin)"}
            </span>
            <button
              onClick={() => setFounderAllocation(alloc)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Apply
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
