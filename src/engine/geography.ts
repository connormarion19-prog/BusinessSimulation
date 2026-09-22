import type { EconomyState } from "../types/core";
import type { CompetitorCompany } from "../types/competitor";
import type { MarketState, RegionalMarketState } from "../types/industry";
import type { RngState } from "./rng";
import { nextRange } from "./rng";
import { round2 } from "./ledger";
import { LOCATIONS_BY_ID, locationDistance } from "../data/locations";

const COMPETITIVE_PRESENCE_RADIUS = 40;

/** Rough 0-1 estimate of how contested a region is, from how much nearby competitor capacity exists relative to the region's own demand. Never exact — the player only ever sees this as an estimate. */
/** Raw distance-weighted competitor capacity near a region — the real input behind estimateCompetitivePressure, also used directly to size regional demand capture. */
export function estimateNearbyCompetitorCapacity(competitors: CompetitorCompany[], locationId: string): number {
  let nearbyCapacity = 0;
  for (const c of competitors) {
    const distance = locationDistance(c.locationId, locationId);
    const proximity = Math.max(0, 1 - distance / COMPETITIVE_PRESENCE_RADIUS);
    nearbyCapacity += c.capacityUnits * proximity;
  }
  return nearbyCapacity;
}

export function estimateCompetitivePressure(competitors: CompetitorCompany[], locationId: string, regionDemand: number): number {
  if (regionDemand <= 0) return 0.5;
  const nearbyCapacity = estimateNearbyCompetitorCapacity(competitors, locationId);
  return Math.max(0, Math.min(1, nearbyCapacity / (regionDemand * 6)));
}

/** Seeds a brand-new regional market the company hasn't operated in before, anchored off the home market's price level. */
export function seedRegionalMarket(
  locationId: string,
  homeWeeklyDemandUnits: number,
  homeAvgPrice: number,
  competitors: CompetitorCompany[],
  rng: RngState,
): RegionalMarketState {
  const location = LOCATIONS_BY_ID[locationId];
  const multiplier = location?.regionalDemandMultiplier ?? 1;
  const weeklyDemandUnits = round2(homeWeeklyDemandUnits * multiplier * nextRange(rng, 0.85, 1.15));
  const avgMarketPrice = round2(homeAvgPrice * nextRange(rng, 0.94, 1.06));
  return {
    locationId,
    weeklyDemandUnits,
    estimatedDemandRangeUnits: [round2(weeklyDemandUnits * 0.85), round2(weeklyDemandUnits * 1.15)],
    avgMarketPrice,
    competitivePressure: estimateCompetitivePressure(competitors, locationId, weeklyDemandUnits),
  };
}

/** Weekly organic drift for a region the company already operates in, independent of the home market's own drift. */
export function driftRegionalMarket(
  region: RegionalMarketState,
  economy: EconomyState,
  competitors: CompetitorCompany[],
  rng: RngState,
): RegionalMarketState {
  const demandDrift = nextRange(rng, -0.02, 0.025) + (economy.demandIndex - 1) * 0.15;
  const weeklyDemandUnits = round2(Math.max(50, region.weeklyDemandUnits * (1 + demandDrift)));
  const priceDrift = nextRange(rng, -0.015, 0.018);
  const avgMarketPrice = round2(Math.max(1, region.avgMarketPrice * (1 + priceDrift)));
  return {
    ...region,
    weeklyDemandUnits,
    estimatedDemandRangeUnits: [round2(weeklyDemandUnits * 0.85), round2(weeklyDemandUnits * 1.15)],
    avgMarketPrice,
    competitivePressure: estimateCompetitivePressure(competitors, region.locationId, weeklyDemandUnits),
  };
}

/** The home region's regional-market record mirrors the legacy national MarketState fields every week, so single-facility companies see no behavior change. */
export function syncHomeRegion(market: MarketState, homeLocationId: string, competitors: CompetitorCompany[]): void {
  market.regions[homeLocationId] = {
    locationId: homeLocationId,
    weeklyDemandUnits: market.regionalWeeklyDemandUnits,
    estimatedDemandRangeUnits: market.estimatedDemandRangeUnits,
    avgMarketPrice: market.avgMarketPrice,
    competitivePressure: estimateCompetitivePressure(competitors, homeLocationId, market.regionalWeeklyDemandUnits),
  };
}
