import type { Company } from "../types/core";
import type { JournalEntry } from "../types/finance";
import { makeEntry, dr, cr, round2 } from "./ledger";
import { locationDistance } from "../data/locations";

const FREIGHT_BASE_RATE_PER_UNIT = 0.015; // $ per unit per distance-unit
const FREIGHT_FLOOR_PER_UNIT = 0.4; // minimum handling/local-delivery cost even at zero distance
const TRANSIT_WEEKS_PER_DISTANCE_UNIT = 0.12;
const MIN_TRANSIT_WEEKS = 1;

export function freightCostPerUnit(fromLocationId: string, toLocationId: string): number {
  const distance = locationDistance(fromLocationId, toLocationId);
  return round2(FREIGHT_FLOOR_PER_UNIT + distance * FREIGHT_BASE_RATE_PER_UNIT);
}

export function transitWeeksFor(fromLocationId: string, toLocationId: string): number {
  const distance = locationDistance(fromLocationId, toLocationId);
  return Math.max(MIN_TRANSIT_WEEKS, Math.round(distance * TRANSIT_WEEKS_PER_DISTANCE_UNIT));
}

export interface TransferResult {
  ok: boolean;
  entries: JournalEntry[];
  reason?: string;
  quantityShipped?: number;
}

/**
 * Ships finished-goods inventory of one product between two of the company's own facilities. Freight is
 * booked to the ledger immediately; the shipped units leave the source facility's bucket right away but
 * don't land in the destination's bucket until transit time elapses (see processInTransitShipments).
 * Total company-wide sellable inventory (product.inventoryUnits) is unaffected — a transfer only moves
 * where units physically sit, never how many the company owns.
 */
export function transferInventory(
  company: Company,
  productId: string,
  fromFacilityId: string,
  toFacilityId: string,
  quantity: number,
  week: number,
  date: string,
): TransferResult {
  const product = company.products.find((p) => p.id === productId);
  const fromFacility = company.facilities.find((f) => f.id === fromFacilityId);
  const toFacility = company.facilities.find((f) => f.id === toFacilityId);
  if (!product || !fromFacility || !toFacility) return { ok: false, entries: [], reason: "Unknown product or facility." };
  if (fromFacilityId === toFacilityId) return { ok: false, entries: [], reason: "Source and destination are the same facility." };
  if (toFacility.status !== "operating") return { ok: false, entries: [], reason: "Destination facility isn't open yet." };
  if (quantity <= 0) return { ok: false, entries: [], reason: "Quantity must be positive." };

  const available = product.facilityInventory[fromFacilityId] ?? 0;
  const qty = round2(Math.min(quantity, available));
  if (qty <= 0) return { ok: false, entries: [], reason: "No inventory available at the source facility." };

  const destinationOnHand = product.facilityInventory[toFacilityId] ?? 0;
  const inboundAlready = company.inTransitShipments
    .filter((s) => s.toFacilityId === toFacilityId && s.productId === productId)
    .reduce((s, sh) => s + sh.quantity, 0);
  const room = Math.max(0, toFacility.storageCapacityUnits - destinationOnHand - inboundAlready);
  const shippedQty = round2(Math.min(qty, room));
  if (shippedQty <= 0) return { ok: false, entries: [], reason: "Destination facility has no free storage capacity." };

  const perUnit = freightCostPerUnit(fromFacility.locationId, toFacility.locationId);
  const freightCost = round2(shippedQty * perUnit);
  const transitWeeks = transitWeeksFor(fromFacility.locationId, toFacility.locationId);

  product.facilityInventory[fromFacilityId] = round2(available - shippedQty);

  const entries: JournalEntry[] = [];
  if (freightCost > 0) {
    entries.push(
      makeEntry({
        week,
        date,
        memo: `Freight: ${product.name} ${fromFacility.name} → ${toFacility.name} (${Math.round(shippedQty)} units)`,
        source: "internal-transfer",
        lines: [dr("freight-expense", freightCost), cr("cash", freightCost)],
        cashFlowCategory: "operating",
      }),
    );
  }

  company.inTransitShipments.push({
    id: `transfer-${week}-${Math.round(Math.random() * 1e6)}`,
    productId,
    fromFacilityId,
    toFacilityId,
    quantity: shippedQty,
    freightCost,
    shipWeek: week,
    arrivalWeek: week + transitWeeks,
  });

  return { ok: true, entries, quantityShipped: shippedQty };
}

/** Weekly: lands any shipment whose transit time has elapsed into the destination facility's bucket. */
export function processInTransitShipments(company: Company, week: number): void {
  const arrived = company.inTransitShipments.filter((s) => week >= s.arrivalWeek);
  if (arrived.length === 0) return;
  for (const shipment of arrived) {
    const product = company.products.find((p) => p.id === shipment.productId);
    if (!product) continue;
    product.facilityInventory[shipment.toFacilityId] = round2(
      (product.facilityInventory[shipment.toFacilityId] ?? 0) + shipment.quantity,
    );
  }
  company.inTransitShipments = company.inTransitShipments.filter((s) => week < s.arrivalWeek);
}

/** The nearest facility (any status doesn't matter — only operating ones are passed in) to a given region, used to price freight for a region without local stock. */
export function nearestFacility<T extends { locationId: string }>(facilities: T[], toLocationId: string): T | undefined {
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const f of facilities) {
    const d = locationDistance(f.locationId, toLocationId);
    if (d < bestDistance) {
      bestDistance = d;
      best = f;
    }
  }
  return best;
}
