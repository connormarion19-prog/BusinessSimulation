import type { CompetitorCompany, CompetitorStrategy } from "../types/competitor";
import type { EconomyState } from "../types/core";
import type { MarketState } from "../types/industry";
import type { RngState } from "./rng";
import { nextRange, pick, weightedPick } from "./rng";
import { round2 } from "./ledger";
import { LOCATIONS } from "../data/locations";

const STRATEGIES: CompetitorStrategy[] = ["cost-leader", "premium-differentiator", "aggressive-growth", "defend-regional", "cash-conservative"];
const COMPETITOR_NAME_PREFIXES = ["Northgate", "Ironwood", "Blue River", "Cascade", "Stonebridge", "Meridian", "Redwood", "Fairview"];
const COMPETITOR_NAME_SUFFIXES = ["Paper Co.", "Mills", "Converting", "Fiber Products", "Industries", "Paper Group"];

/** Most competitors start near the player's home market (where the pool is deepest); a minority are scattered nationally so other regions aren't empty on entry. */
function pickCompetitorLocation(homeLocationId: string, rng: RngState): string {
  if (chanceRoll(rng, 0.6)) return homeLocationId;
  return pick(rng, LOCATIONS).id;
}

export function generateInitialCompetitors(market: MarketState, foundedWeek: number, rng: RngState, count = 3, homeLocationId = "wi-greenbay"): CompetitorCompany[] {
  const competitors: CompetitorCompany[] = [];
  for (let i = 0; i < count; i++) {
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const scale = nextRange(rng, 0.6, 2.2);
    const capacityUnits = Math.round(market.regionalWeeklyDemandUnits * 0.12 * scale);
    competitors.push({
      id: `competitor-${i + 1}`,
      name: `${pick(rng, COMPETITOR_NAME_PREFIXES)} ${pick(rng, COMPETITOR_NAME_SUFFIXES)}`,
      industryId: "paper-manufacturing",
      locationId: pickCompetitorLocation(homeLocationId, rng),
      strategy,
      cash: Math.round(nextRange(rng, 80_000, 600_000)),
      debt: Math.round(nextRange(rng, 0, 300_000)),
      price: round2(market.avgMarketPrice * nextRange(rng, 0.9, 1.15)),
      capacityUnits,
      employeeCount: Math.round(capacityUnits / 15),
      weeklyRevenue: 0,
      weeklyNetIncome: 0,
      marketShareEstimate: 0,
      aggressiveness: strategy === "aggressive-growth" ? nextRange(rng, 0.6, 0.9) : nextRange(rng, 0.2, 0.5),
      financialHealth: Math.round(nextRange(rng, 55, 85)),
      founded: foundedWeek - Math.round(nextRange(rng, 100, 900)),
      history: [],
    });
  }
  const totalCapacity = competitors.reduce((s, c) => s + c.capacityUnits, 0);
  for (const c of competitors) c.marketShareEstimate = totalCapacity > 0 ? round2(c.capacityUnits / totalCapacity) : 0;
  return competitors;
}

/** Mutates competitors in place based on their own strategy and the current market; returns brief narrative notes for anything notable. */
export function simulateCompetitorsWeek(
  competitors: CompetitorCompany[],
  market: MarketState,
  economy: EconomyState,
  playerPrice: number,
  week: number,
  rng: RngState,
): { active: CompetitorCompany[]; narratives: string[] } {
  const narratives: string[] = [];
  const active: CompetitorCompany[] = [];

  for (const c of competitors) {
    const priceGapVsMarket = c.price / market.avgMarketPrice - 1;
    let targetPrice = c.price;

    switch (c.strategy) {
      case "cost-leader":
        targetPrice = market.avgMarketPrice * 0.93;
        break;
      case "premium-differentiator":
        targetPrice = market.avgMarketPrice * 1.12;
        break;
      case "aggressive-growth":
        targetPrice = Math.min(playerPrice, market.avgMarketPrice) * 0.96;
        if (c.cash > 150_000 && chanceRoll(rng, c.aggressiveness * 0.25)) {
          c.capacityUnits = Math.round(c.capacityUnits * 1.06);
          c.cash -= Math.round(c.capacityUnits * 8);
          narratives.push(`${c.name} expanded capacity, chasing growth.`);
        }
        break;
      case "defend-regional":
        targetPrice = market.avgMarketPrice * (priceGapVsMarket > 0.05 ? 0.98 : 1.0);
        break;
      case "cash-conservative":
        targetPrice = c.price; // sticky
        break;
    }
    c.price = round2(c.price * 0.85 + targetPrice * 0.15 + (nextRange(rng, -0.01, 0.01) * c.price));

    const utilization = nextRange(rng, 0.65, 0.92);
    const revenue = round2(c.price * c.capacityUnits * utilization);
    const costRatio = c.strategy === "cost-leader" ? 0.78 : c.strategy === "premium-differentiator" ? 0.62 : 0.72;
    const overhead = round2(c.capacityUnits * 0.55 + c.employeeCount * 620);
    const netIncome = round2(revenue * (1 - costRatio) - overhead);
    c.weeklyRevenue = revenue;
    c.weeklyNetIncome = netIncome;
    c.cash = round2(c.cash + netIncome - c.debt * 0.001);

    c.financialHealth = Math.max(0, Math.min(100, c.financialHealth + (netIncome > 0 ? 0.6 : -1.2) + (economy.demandIndex - 1) * 5));

    if (c.cash < -100_000 && c.financialHealth < 15) {
      narratives.push(`${c.name} filed for bankruptcy and exited the market.`);
      c.history.push({ week, note: "Exited the market (bankruptcy)." });
      continue; // do not carry forward
    }
    active.push(c);
  }

  const totalCapacity = active.reduce((s, c) => s + c.capacityUnits, 0);
  for (const c of active) c.marketShareEstimate = totalCapacity > 0 ? round2(c.capacityUnits / totalCapacity) : 0;

  return { active, narratives };
}

function chanceRoll(rng: RngState, p: number): boolean {
  return weightedPick(rng, [
    [true, Math.max(0.001, p)],
    [false, Math.max(0.001, 1 - p)],
  ]);
}
