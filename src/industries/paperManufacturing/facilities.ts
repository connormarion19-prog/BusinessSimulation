import type { FacilityTemplate } from "../../types/industry";

export const PAPER_FACILITIES: FacilityTemplate[] = [
  {
    id: "small-job-shop",
    name: "Small Job Shop",
    type: "job-shop",
    description: "A single used converting line in a leased industrial unit. Cheap to start, low capacity, no room to run more than one product at real volume.",
    baseWeeklyCapacityUnits: 420,
    equipmentLevel: 1,
    weeklyLeaseCost: 900,
    weeklyUtilityBaseCost: 350,
    purchaseValue: 60_000,
    minStartingCapitalRecommended: 40_000,
  },
  {
    id: "mid-size-mill",
    name: "Mid-Size Mill",
    type: "mill",
    description: "A proper small mill with real converting capacity and room to run a second product line eventually.",
    baseWeeklyCapacityUnits: 1_500,
    equipmentLevel: 2,
    weeklyLeaseCost: 2_800,
    weeklyUtilityBaseCost: 1_100,
    purchaseValue: 220_000,
    minStartingCapitalRecommended: 150_000,
  },
  {
    id: "modern-converting-plant",
    name: "Modern Converting Plant",
    type: "plant",
    description: "A larger, more automated facility. Big capacity and lower per-unit overhead, but a serious capital commitment for a first-time operator.",
    baseWeeklyCapacityUnits: 4_000,
    equipmentLevel: 3,
    weeklyLeaseCost: 6_500,
    weeklyUtilityBaseCost: 2_600,
    purchaseValue: 600_000,
    minStartingCapitalRecommended: 400_000,
  },
];

export const PAPER_FACILITIES_BY_ID: Record<string, FacilityTemplate> = Object.fromEntries(
  PAPER_FACILITIES.map((f) => [f.id, f]),
);
