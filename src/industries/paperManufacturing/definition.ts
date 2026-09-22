import type { IndustryDefinition, MarketState, NewCompanyParams } from "../../types/industry";
import type { Company } from "../../types/core";
import type { RngState } from "../../engine/rng";
import { seedJournalEntryCounter, round2 } from "../../engine/ledger";
import { defaultDelegationSettings } from "../../engine/delegation";
import { buildFoundingEntries } from "../../engine/financing";
import { nextInt, nextRange, pick } from "../../engine/rng";
import { PAPER_ROLES } from "./roles";
import { PAPER_PRODUCTS, PAPER_PRODUCTS_BY_ID } from "./products";
import { PAPER_FACILITIES, PAPER_FACILITIES_BY_ID } from "./facilities";
import { PAPER_SUPPLIERS, PAPER_SUPPLIERS_BY_ID } from "./suppliers";
import { PAPER_CUSTOMER_SEGMENTS, PAPER_CUSTOMER_SEGMENTS_BY_ID } from "./customers";
import { PAPER_EVENTS } from "./events";
import { simulatePaperManufacturingWeek } from "./weekly";

const STARTER_CUSTOMER_NAMES = ["Heartland Distribution", "Lakeside Wholesale Partners", "Crestview Supply Co.", "Union Print Partners"];

function createInitialState(params: NewCompanyParams, rng: RngState): { company: Company; market: MarketState } {
  const facilityTemplate = PAPER_FACILITIES_BY_ID[params.facilityTemplateId] ?? PAPER_FACILITIES[0];
  const productTemplate = PAPER_PRODUCTS_BY_ID[params.productTemplateId] ?? PAPER_PRODUCTS[0];
  const segment = PAPER_CUSTOMER_SEGMENTS_BY_ID[params.targetCustomerSegmentId] ?? PAPER_CUSTOMER_SEGMENTS[0];
  const defaultSupplier = PAPER_SUPPLIERS_BY_ID["regional-pulp-co"] ?? PAPER_SUPPLIERS[0];

  const { entries: foundingEntries, loan, ownership } = buildFoundingEntries(params);
  seedJournalEntryCounter(foundingEntries);

  const founderPriceNoise = nextRange(rng, 0.95, 1.05);
  const foundingReferencePrice = round2(productTemplate.suggestedUnitPrice * founderPriceNoise);

  const company: Company = {
    id: `co-${Date.now()}`,
    name: params.name,
    industryId: "paper-manufacturing",
    locationId: params.locationId,
    foundedWeek: params.foundedWeek,
    foundedDate: params.foundedDate,
    stage: "founder",
    entries: foundingEntries,
    loans: loan ? [loan] : [],
    facilities: [
      {
        id: "facility-1",
        name: facilityTemplate.name,
        type: facilityTemplate.type,
        role: facilityTemplate.role,
        locationId: params.locationId,
        baseWeeklyCapacityUnits: facilityTemplate.baseWeeklyCapacityUnits,
        storageCapacityUnits: facilityTemplate.storageCapacityUnits,
        equipmentLevel: facilityTemplate.equipmentLevel,
        condition: 100,
        weeklyLeaseCost: facilityTemplate.weeklyLeaseCost,
        weeklyUtilityBaseCost: facilityTemplate.weeklyUtilityBaseCost,
        ownedOutright: false,
        ownershipType: "lease",
        purchaseValue: facilityTemplate.purchaseValue,
        status: "operating",
        constructionCompleteWeek: null,
        openedWeek: params.foundedWeek,
      },
    ],
    products: [
      {
        id: "product-1",
        templateId: productTemplate.id,
        name: productTemplate.name,
        sku: `${productTemplate.id.toUpperCase().slice(0, 4)}-${nextInt(rng, 1000, 9999)}`,
        unitLabel: productTemplate.unitLabel,
        priceWeekly: productTemplate.suggestedUnitPrice,
        referenceMarketPrice: foundingReferencePrice,
        inputUnitsPerProductUnit: productTemplate.inputUnitsPerProductUnit,
        capacityAllocationPct: 1,
        inventoryUnits: 0,
        fgValueMaterials: 0,
        fgValueLabor: 0,
        fgValueOverhead: 0,
        unitsProducedLastWeek: 0,
        unitsSoldLastWeek: 0,
        unitsUnfulfilledLastWeek: 0,
        active: true,
        facilityInventory: { "facility-1": 0 },
      },
    ],
    rawMaterialInventoryUnits: 0,
    employees: [],
    openPositions: [],
    customers: [0, 1].map((i) => ({
      id: `starter-customer-${i}`,
      name: STARTER_CUSTOMER_NAMES[i] ?? `${pick(rng, STARTER_CUSTOMER_NAMES)} #${i}`,
      productId: "product-1",
      segment: segment.id,
      location: "Regional",
      locationId: params.locationId,
      annualVolumeUnits: Math.round(nextRange(rng, segment.typicalAnnualVolumeUnits[0], segment.typicalAnnualVolumeUnits[0] * 1.6)),
      priceSensitivity: segment.priceSensitivity,
      qualityExpectation: segment.qualityExpectation,
      paymentTermsDays: segment.paymentTermsDays,
      relationshipStrength: 55,
      contractedSince: params.foundedWeek,
      lastOrderWeek: null,
      atRisk: false,
    })),
    suppliers: [
      {
        id: "supplier-1",
        name: defaultSupplier.name,
        inputId: defaultSupplier.inputId,
        location: defaultSupplier.location,
        pricePerUnit: defaultSupplier.pricePerUnit,
        quality: defaultSupplier.quality,
        reliability: defaultSupplier.reliability,
        paymentTermsDays: defaultSupplier.paymentTermsDays,
        leadTimeWeeks: defaultSupplier.leadTimeWeeks,
        purchaseAllocationPct: 1,
        isPrimary: true,
      },
    ],
    founderAllocation: { production: 0.35, purchasing: 0.2, sales: 0.2, accounting: 0.15, administration: 0.1 },
    kpiHistory: [],
    historyLog: [
      {
        week: params.foundedWeek,
        date: params.foundedDate,
        headline: `${params.name} founded`,
        detail: `Founded as a ${facilityTemplate.name.toLowerCase()} producing ${productTemplate.name.toLowerCase()}.`,
        category: "founding",
      },
    ],
    ownership,
    targetCustomerSegment: segment.id,
    delegation: defaultDelegationSettings(),
    managerDecisionLog: [],
    enteredMarkets: [],
    inTransitShipments: [],
  };

  const market: MarketState = {
    regionalWeeklyDemandUnits: facilityTemplate.baseWeeklyCapacityUnits * nextRange(rng, 6, 11),
    estimatedDemandRangeUnits: [0, 0],
    avgMarketPrice: foundingReferencePrice,
    inputPricePerUnit: defaultSupplier.pricePerUnit,
    inputPriceTrendPct: 0,
    priceElasticity: 1.4,
    unitLabel: productTemplate.unitLabel,
    inputLabel: "pulp-ton",
    regions: {},
  };
  market.estimatedDemandRangeUnits = [Math.round(market.regionalWeeklyDemandUnits * 0.88), Math.round(market.regionalWeeklyDemandUnits * 1.12)];
  market.regions[params.locationId] = {
    locationId: params.locationId,
    weeklyDemandUnits: market.regionalWeeklyDemandUnits,
    estimatedDemandRangeUnits: market.estimatedDemandRangeUnits,
    avgMarketPrice: market.avgMarketPrice,
    competitivePressure: 0.3,
  };

  return { company, market };
}

export const PAPER_MANUFACTURING: IndustryDefinition = {
  id: "paper-manufacturing",
  name: "Paper Manufacturing",
  tagline: "Turn pulp into paper, one ton at a time.",
  description:
    "A commodity-adjacent manufacturer converting purchased wood pulp into paper products. Capital-intensive, exposed to input-price swings, won mostly on cost, reliability, and contract relationships.",
  startingCapitalRange: [40_000, 400_000],
  implemented: true,
  employeeRoles: PAPER_ROLES,
  productTemplates: PAPER_PRODUCTS,
  facilityTemplates: PAPER_FACILITIES,
  supplierTemplates: PAPER_SUPPLIERS,
  customerSegments: PAPER_CUSTOMER_SEGMENTS,
  financingNotes:
    "Facilities and equipment are the major capital draw. A bank or SBA loan sized to the facility choice is typical; bootstrapped starts should pick the Small Job Shop.",
  eventPool: PAPER_EVENTS,
  createInitialState,
  simulateWeek: simulatePaperManufacturingWeek,
};
