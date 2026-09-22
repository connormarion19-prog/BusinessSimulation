import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getIndustryDefinition } from "../industries/registry";
import { LOCATIONS, LOCATIONS_BY_ID } from "../data/locations";
import { formatMoney } from "../engine/dateUtils";
import type { FacilityOwnershipType } from "../types/core";
import type { FacilityFinancing } from "../engine/facilities";
import { Badge, Button, Card, CardHeading, ProgressBar, Table, Td, Th } from "../components/ui";

const OWNERSHIP_LABEL: Record<FacilityOwnershipType, string> = {
  lease: "Lease",
  purchase: "Purchase",
  construction: "Build (construction)",
};

export default function Facilities() {
  const game = useGameStore((s) => s.game)!;
  const openFacility = useGameStore((s) => s.openFacility);
  const transferInventory = useGameStore((s) => s.transferInventory);
  const industry = getIndustryDefinition(game.company.industryId)!;

  const [templateId, setTemplateId] = useState(industry.facilityTemplates[0].id);
  const [locationId, setLocationId] = useState(LOCATIONS[0].id);
  const [ownershipType, setOwnershipType] = useState<FacilityOwnershipType>("lease");
  const [financing, setFinancing] = useState<FacilityFinancing>("cash");

  const [transferProductId, setTransferProductId] = useState(game.company.products[0]?.id ?? "");
  const [transferFrom, setTransferFrom] = useState(game.company.facilities[0]?.id ?? "");
  const [transferTo, setTransferTo] = useState(game.company.facilities[1]?.id ?? "");
  const [transferQty, setTransferQty] = useState(200);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  const template = industry.facilityTemplates.find((t) => t.id === templateId)!;
  const location = LOCATIONS_BY_ID[locationId];
  const scaledLease = Math.round(template.weeklyLeaseCost * location.commercialRentIndex);
  const scaledUtility = Math.round(template.weeklyUtilityBaseCost * location.commercialRentIndex);
  const scaledPurchaseValue = Math.round(template.purchaseValue * location.commercialRentIndex);
  const previewDeposit = scaledLease * 4;
  const upfrontCost = ownershipType === "lease" ? previewDeposit : financing === "loan" ? 0 : scaledPurchaseValue;

  const employeesByFacility = (facilityId: string) =>
    game.company.employees.filter((e) => e.status === "active" && e.facilityId === facilityId);

  const facilityInventoryTotal = (facilityId: string) =>
    game.company.products.reduce((s, p) => s + (p.facilityInventory[facilityId] ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Facilities ({game.company.facilities.length})</h1>

      <Card>
        <CardHeading subtitle="Production/machine-operator hires you assign to a facility work there; every other role serves the whole company regardless of location.">
          Current Facilities
        </CardHeading>
        <div className="flex flex-col gap-4">
          {game.company.facilities.map((facility) => {
            const loc = LOCATIONS_BY_ID[facility.locationId];
            const staff = employeesByFacility(facility.id);
            const inventoryHere = facilityInventoryTotal(facility.id);
            const underConstruction = facility.status === "under-construction";
            return (
              <div key={facility.id} className="rounded-md border border-ink-700 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{facility.name}</div>
                    <div className="text-xs text-ink-400">{loc?.city}, {loc?.state} · {facility.role}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge tone={underConstruction ? "warn" : "neutral"}>
                      {underConstruction ? `Under construction — opens week ${facility.constructionCompleteWeek}` : "Operating"}
                    </Badge>
                    <Badge>{OWNERSHIP_LABEL[facility.ownershipType]}</Badge>
                    {facility.role === "production" && <Badge>{staff.length} staff assigned</Badge>}
                  </div>
                </div>
                <div className="mb-2">
                  <div className="mb-1 flex justify-between text-xs text-ink-400">
                    <span>Equipment condition</span>
                    <span>{Math.round(facility.condition)}%</span>
                  </div>
                  <ProgressBar value={facility.condition} tone={facility.condition < 40 ? "bad" : facility.condition < 70 ? "warn" : "good"} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-ink-300 sm:grid-cols-4">
                  <div>Capacity: {facility.baseWeeklyCapacityUnits.toLocaleString()}/wk</div>
                  <div>Lease: {facility.ownedOutright ? "—" : `${formatMoney(facility.weeklyLeaseCost)}/wk`}</div>
                  <div>Utilities (base): {formatMoney(facility.weeklyUtilityBaseCost)}/wk</div>
                  <div>Labor cost index: {Math.round((loc?.laborCostIndex ?? 1) * 100)}%</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-ink-300 sm:grid-cols-3">
                  <div>Inventory on hand: <span className="text-ink-100">{Math.round(inventoryHere).toLocaleString()}</span> / {facility.storageCapacityUnits.toLocaleString()} storage</div>
                  <div>Purchase value: {formatMoney(facility.purchaseValue)}</div>
                  <div>Opened week {facility.openedWeek}</div>
                </div>
                {staff.length > 0 && (
                  <div className="mt-2 text-xs text-ink-500">{staff.map((e) => e.name).join(", ")}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {game.company.facilities.length > 1 && (
        <Card>
          <CardHeading subtitle="Move finished-goods inventory between your own facilities — the goods leave the source immediately but don't land at the destination until real transit time passes, and freight is booked to the ledger right away.">
            Internal Transfer
          </CardHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <label className="text-sm">
              Product
              <select value={transferProductId} onChange={(e) => setTransferProductId(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                {game.company.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              From
              <select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                {game.company.facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              To
              <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm">
                {game.company.facilities.filter((f) => f.status === "operating").map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Quantity
              <input
                type="number"
                min={1}
                value={transferQty}
                onChange={(e) => setTransferQty(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm"
              />
            </label>
            <Button
              onClick={() => {
                const result = transferInventory(transferProductId, transferFrom, transferTo, transferQty);
                setTransferMessage(result.ok ? "Shipment dispatched." : result.reason ?? "Transfer failed.");
              }}
            >
              Ship
            </Button>
          </div>
          {transferMessage && <p className="mt-2 text-xs text-ink-400">{transferMessage}</p>}
          {game.company.inTransitShipments.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">In Transit</div>
              <Table>
                <thead><tr><Th>Product</Th><Th>Route</Th><Th align="right">Qty</Th><Th align="right">Freight</Th><Th align="right">Arrives</Th></tr></thead>
                <tbody>
                  {game.company.inTransitShipments.map((s) => {
                    const p = game.company.products.find((pp) => pp.id === s.productId);
                    const from = game.company.facilities.find((f) => f.id === s.fromFacilityId);
                    const to = game.company.facilities.find((f) => f.id === s.toFacilityId);
                    return (
                      <tr key={s.id}>
                        <Td>{p?.name ?? s.productId}</Td>
                        <Td className="text-ink-400">{from?.name ?? "?"} → {to?.name ?? "?"}</Td>
                        <Td align="right">{Math.round(s.quantity).toLocaleString()}</Td>
                        <Td align="right">{formatMoney(s.freightCost)}</Td>
                        <Td align="right">wk {s.arrivalWeek}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeading subtitle="Different locations trade off labor cost, rent, taxes, and local demand — the facility's costs scale with the location you pick.">
          Open a New Facility
        </CardHeading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Facility Type</div>
            <div className="flex flex-col gap-1.5">
              {industry.facilityTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-md border p-2 text-left text-xs ${templateId === t.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-ink-400">{t.description}</div>
                  <div className="text-ink-500">Capacity {t.baseWeeklyCapacityUnits.toLocaleString()}/wk · Storage {t.storageCapacityUnits.toLocaleString()} units</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Location</div>
            <div className="flex flex-col gap-1.5">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setLocationId(loc.id)}
                  className={`rounded-md border p-2 text-left text-xs ${locationId === loc.id ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                >
                  <div className="font-semibold">{loc.city}, {loc.state}</div>
                  <div className="text-ink-500">Labor {(loc.laborCostIndex * 100).toFixed(0)}% · Rent {(loc.commercialRentIndex * 100).toFixed(0)}% · Tax {loc.corporateTaxRatePct}%</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Ownership</div>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(OWNERSHIP_LABEL) as FacilityOwnershipType[]).map((ot) => (
                <button
                  key={ot}
                  onClick={() => setOwnershipType(ot)}
                  className={`rounded-md border p-2 text-left text-xs ${ownershipType === ot ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                >
                  <div className="font-semibold">{OWNERSHIP_LABEL[ot]}</div>
                  <div className="text-ink-500">
                    {ot === "lease" && "Lowest upfront cost, fastest to open, no long-term asset — you never own it."}
                    {ot === "purchase" && "Buy an existing building outright — real capital now, but it's yours: no ongoing lease."}
                    {ot === "construction" && `Custom-built — cheaper than an equivalent purchase long-run, but takes ${template.constructionWeeks} weeks before it can produce anything.`}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {ownershipType !== "lease" && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Financing</div>
              <div className="flex flex-col gap-1.5">
                {(["cash", "loan"] as FacilityFinancing[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFinancing(f)}
                    className={`rounded-md border p-2 text-left text-xs ${financing === f ? "border-emerald-500 bg-emerald-600/10" : "border-ink-700 bg-ink-900"}`}
                  >
                    <div className="font-semibold">{f === "cash" ? "Pay in cash" : "Finance with a loan"}</div>
                    <div className="text-ink-500">
                      {f === "cash" ? `${formatMoney(scaledPurchaseValue)} paid immediately from cash on hand.` : "A real amortizing bank note secured against the facility — no cash outlay now, but weekly interest and principal payments follow."}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-md border border-ink-700 bg-ink-950 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Estimated Economics</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-300 sm:grid-cols-4">
            <div>Weekly lease: <span className="font-semibold text-ink-100">{ownershipType === "lease" ? formatMoney(scaledLease) : "—"}</span></div>
            <div>Weekly utilities: <span className="font-semibold text-ink-100">{formatMoney(scaledUtility)}</span></div>
            <div>Upfront cash needed: <span className="font-semibold text-ink-100">{formatMoney(upfrontCost)}</span></div>
            <div>Capacity added: <span className="font-semibold text-ink-100">{template.baseWeeklyCapacityUnits.toLocaleString()}/wk</span></div>
          </div>
          {ownershipType === "construction" && (
            <p className="mt-2 text-xs text-amber-400">Construction takes {template.constructionWeeks} weeks — no capacity, staffing, or sales here until it's complete.</p>
          )}
          {template.baseWeeklyCapacityUnits > 0 && (
            <p className="mt-2 text-xs text-amber-400">
              A new production facility produces nothing until you assign production/machine-operator staff to it — the founder can only physically work the original facility.
            </p>
          )}
          <Button className="mt-3" onClick={() => openFacility(templateId, locationId, ownershipType, financing)}>
            Open This Facility
          </Button>
        </div>
      </Card>

      {game.lastManagementSnapshot && (
        <Card>
          <CardHeading subtitle="Every facility, product line, and hire adds to what one person has to keep track of.">Management Load</CardHeading>
          <Table>
            <tbody>
              <tr><Td>Management load this week</Td><Td align="right">{game.lastManagementSnapshot.managementLoad.toFixed(1)}</Td></tr>
              <tr><Td>Management capacity (you + managers)</Td><Td align="right">{game.lastManagementSnapshot.managementCapacity.toFixed(1)}</Td></tr>
              <tr><Td>Founder effectiveness</Td><Td align="right">{Math.round(game.lastManagementSnapshot.founderEffectiveness * 100)}%</Td></tr>
              <tr><Td>Managers on staff</Td><Td align="right">{game.lastManagementSnapshot.managerCount}</Td></tr>
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
