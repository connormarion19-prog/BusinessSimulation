import { useState } from "react";
import { Link } from "react-router-dom";
import { useGameStore } from "../store/useGameStore";
import { isDepartmentDelegated } from "../engine/company";
import { formatMoney } from "../engine/dateUtils";
import { Card, CardHeading, ProgressBar, Badge } from "../components/ui";

export default function Operations() {
  const game = useGameStore((s) => s.game)!;
  const setFounderAllocation = useGameStore((s) => s.setFounderAllocation);
  const { company, market } = game;
  const facility = company.facilities[0];
  const activeProducts = company.products.filter((p) => p.active);

  const [alloc, setAlloc] = useState(company.founderAllocation);
  const allocTotal = alloc.production + alloc.purchasing + alloc.sales + alloc.accounting;

  const totalCapacityAllocated = activeProducts.reduce((s, p) => s + p.capacityAllocationPct, 0);
  const machineCapacity = facility.baseWeeklyCapacityUnits * (facility.condition / 100);
  const totalProducedLastWeek = company.products.reduce((s, p) => s + p.unitsProducedLastWeek, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Operations</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              <div>Machine capacity: {Math.round(machineCapacity).toLocaleString()} units/wk</div>
              <div>Produced last week (all products): {Math.round(totalProducedLastWeek).toLocaleString()}</div>
              <div>Weekly lease: {formatMoney(facility.weeklyLeaseCost)}</div>
              <div>Weekly utilities (base): {formatMoney(facility.weeklyUtilityBaseCost)}</div>
              <div>Raw material on hand: {Math.round(company.rawMaterialInventoryUnits)} {market.inputLabel}s</div>
              <div>Input price (purchase-weighted avg): ${market.inputPricePerUnit.toFixed(2)}/{market.inputLabel}</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeading subtitle={<>Capacity is split across active product lines — manage this in <Link className="text-emerald-400 underline" to="/game/products">Products</Link>.</>}>
            Capacity Allocation
          </CardHeading>
          <div className="flex flex-col gap-2">
            {activeProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>{p.name}</span>
                <span className="tabular-nums text-ink-300">{Math.round(p.capacityAllocationPct * 100)}%</span>
              </div>
            ))}
            <div className="mt-1 border-t border-ink-700 pt-2 text-xs text-ink-400">
              Total allocated: {Math.round(totalCapacityAllocated * 100)}%
              {totalCapacityAllocated < 0.98 && ` — ${Math.round((1 - totalCapacityAllocated) * 100)}% of capacity sits idle`}
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
