import type { IndustryEventDefinition } from "../../types/industry";
import { chance, nextInt, nextRange, weightedPick } from "../../engine/rng";
import { makeEntry, dr, cr, round2 } from "../../engine/ledger";
import { PAPER_CUSTOMER_SEGMENTS } from "./customers";

export function supplierShortfallFlagKey(supplierId: string): string {
  return `shortfall:${supplierId}`;
}

let eventCustomerCounter = 0;

/**
 * Events read and react to the company's own history (supplier diversification,
 * maintenance staffing, quality staffing) rather than firing as context-free cards —
 * per the design brief, consequences should trace back to prior decisions.
 */
export const PAPER_EVENTS: IndustryEventDefinition[] = [
  {
    id: "major-supplier-disruption",
    title: "Pulp Supplier Disruption",
    category: "supply-chain",
    severity: "negative",
    baseWeeklyProbability: 0.02,
    eligible: (ctx) => ctx.company.suppliers.length > 0,
    apply: (ctx) => {
      // The disrupted supplier is picked weighted by how much of your purchasing depends on them —
      // diversifying spend across suppliers, not just adding a second one, is what actually limits the damage.
      const disrupted = weightedPick(
        ctx.rng,
        ctx.company.suppliers.map((s) => [s, Math.max(0.01, s.purchaseAllocationPct)] as const),
      );
      const diversified = ctx.company.suppliers.length > 1;
      const outageBaseTons = diversified ? nextRange(ctx.rng, 40, 110) : nextRange(ctx.rng, 60, 140);
      const severityUnits = Math.round(outageBaseTons * disrupted.purchaseAllocationPct);
      const narrative = diversified
        ? `${disrupted.name} had a plant outage this week — they supply about ${Math.round(disrupted.purchaseAllocationPct * 100)}% of your pulp, so roughly ${severityUnits} pulp-tons of expected material didn't arrive; your other supplier(s) kept the rest flowing.`
        : `${disrupted.name} had a plant outage this week and couldn't fill the order at all. With no backup supplier on the books, roughly ${severityUnits} pulp-tons of expected material simply didn't arrive.`;
      ctx.eventFlags[supplierShortfallFlagKey(disrupted.id)] = (ctx.eventFlags[supplierShortfallFlagKey(disrupted.id)] ?? 0) + severityUnits;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: `Supplier disruption: ${disrupted.name}`,
          detail: narrative,
          category: "event",
        },
      };
    },
  },
  {
    id: "equipment-breakdown",
    title: "Equipment Breakdown",
    category: "operations",
    severity: "negative",
    baseWeeklyProbability: 0.018,
    eligible: (ctx) => ctx.company.facilities.length > 0,
    apply: (ctx) => {
      const facility = ctx.company.facilities[0];
      const hasMaintTech = ctx.company.employees.some((e) => e.roleId === "maintenance-tech" && e.status === "active");
      const repairCost = round2(hasMaintTech ? nextRange(ctx.rng, 800, 2200) : nextRange(ctx.rng, 2500, 7000));
      facility.condition = Math.max(20, facility.condition - (hasMaintTech ? 12 : 28));
      const entries = [
        makeEntry({
          week: ctx.week,
          date: ctx.date,
          memo: "Emergency equipment repair",
          source: "equipment-breakdown",
          lines: [dr("maintenance-expense", repairCost), cr("cash", repairCost)],
          cashFlowCategory: "operating",
        }),
      ];
      const narrative = hasMaintTech
        ? `A converting-line component failed this week. Your maintenance tech had it running again within the day — $${repairCost.toLocaleString()} in parts, and only a modest capacity hit.`
        : `A converting-line component failed this week with no maintenance staff to respond quickly. The repair bill ran $${repairCost.toLocaleString()}, and the line was down long enough to meaningfully cut this week's output.`;
      return {
        entries,
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: "Equipment breakdown on the production floor",
          detail: narrative,
          category: "event",
        },
      };
    },
  },
  {
    id: "pulp-price-spike",
    title: "Pulp Price Spike",
    category: "market",
    severity: "negative",
    baseWeeklyProbability: 0.015,
    eligible: () => true,
    apply: (ctx) => {
      const pctIncrease = round2(nextRange(ctx.rng, 14, 32));
      for (const supplier of ctx.company.suppliers) {
        supplier.pricePerUnit = round2(supplier.pricePerUnit * (1 + pctIncrease / 100));
      }
      ctx.market.inputPricePerUnit = round2(ctx.market.inputPricePerUnit * (1 + pctIncrease / 100));
      const narrative = `Pulp markets moved sharply this week — industry-wide input costs jumped about ${pctIncrease}% across every supplier, pushing your average delivered pulp price to roughly $${ctx.market.inputPricePerUnit.toFixed(2)}/ton.`;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: `Pulp prices spiked ${pctIncrease}%`,
          detail: narrative,
          category: "market",
        },
      };
    },
  },
  {
    id: "large-customer-opportunity",
    title: "Large Customer Opportunity",
    category: "sales",
    severity: "positive",
    baseWeeklyProbability: 0.02,
    eligible: (ctx) => ctx.company.customers.length < 12,
    apply: (ctx) => {
      const segment = PAPER_CUSTOMER_SEGMENTS[nextInt(ctx.rng, 0, PAPER_CUSTOMER_SEGMENTS.length - 1)];
      eventCustomerCounter += 1;
      const annualVolume = Math.round(nextRange(ctx.rng, segment.typicalAnnualVolumeUnits[0], segment.typicalAnnualVolumeUnits[1]) * 1.3);
      const name = `${["Heartland", "Union", "Lakeshore", "Crestview", "Summit"][nextInt(ctx.rng, 0, 4)]} ${["Distribution", "Supply Partners", "Wholesale", "Converters"][nextInt(ctx.rng, 0, 3)]}`;
      const activeProducts = ctx.company.products.filter((p) => p.active);
      const targetProduct = activeProducts.length > 0 ? activeProducts[nextInt(ctx.rng, 0, activeProducts.length - 1)] : ctx.company.products[0];
      ctx.company.customers.push({
        id: `cust-event-${eventCustomerCounter}`,
        name,
        productId: targetProduct.id,
        segment: segment.id,
        location: "Regional",
        locationId: ctx.company.locationId,
        annualVolumeUnits: annualVolume,
        priceSensitivity: segment.priceSensitivity,
        qualityExpectation: segment.qualityExpectation,
        paymentTermsDays: segment.paymentTermsDays,
        relationshipStrength: 55,
        contractedSince: ctx.week,
        lastOrderWeek: null,
        atRisk: false,
      });
      const narrative = `${name}, a ${segment.name.toLowerCase()}, reached out looking for a new supplier of ${targetProduct.name.toLowerCase()} and signed on — roughly ${annualVolume.toLocaleString()} units/year of potential volume if you can consistently deliver.`;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: `New account: ${name}`,
          detail: narrative,
          category: "market",
        },
      };
    },
  },
  {
    id: "quality-complaint-wave",
    title: "Quality Complaint Wave",
    category: "quality",
    severity: "negative",
    baseWeeklyProbability: 0.015,
    eligible: (ctx) => ctx.company.customers.length > 0,
    apply: (ctx) => {
      const hasInspector = ctx.company.employees.some((e) => e.roleId === "quality-inspector" && e.status === "active");
      const strengthLoss = hasInspector ? nextInt(ctx.rng, 3, 8) : nextInt(ctx.rng, 10, 22);
      let affected = 0;
      for (const customer of ctx.company.customers) {
        if (chance(ctx.rng, 0.5)) {
          customer.relationshipStrength = Math.max(0, customer.relationshipStrength - strengthLoss);
          if (customer.relationshipStrength < 35) customer.atRisk = true;
          affected += 1;
        }
      }
      const narrative = hasInspector
        ? `A bad batch slipped out before your quality inspector caught the pattern — ${affected} customer${affected === 1 ? "" : "s"} noticed, though the damage was limited.`
        : `A run of defective product reached customers with no quality inspection to catch it — ${affected} customer${affected === 1 ? "" : "s"} complained, and some relationships took real damage.`;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: "Quality complaints from customers",
          detail: narrative,
          category: "event",
        },
      };
    },
  },
  {
    id: "purchasing-cost-win",
    title: "Purchasing Negotiates a Discount",
    category: "supply-chain",
    severity: "positive",
    baseWeeklyProbability: 0.02,
    eligible: (ctx) => ctx.company.employees.some((e) => e.roleId === "purchasing-agent" && e.status === "active") || ctx.company.founderAllocation.purchasing > 0.25,
    apply: (ctx) => {
      const target = weightedPick(
        ctx.rng,
        ctx.company.suppliers.map((s) => [s, Math.max(0.01, s.purchaseAllocationPct)] as const),
      );
      const discountPct = round2(nextRange(ctx.rng, 4, 11));
      target.pricePerUnit = round2(target.pricePerUnit * (1 - discountPct / 100));
      const narrative = `A well-timed renegotiation with ${target.name} locked in better terms — about ${discountPct}% off their price, now $${target.pricePerUnit.toFixed(2)}/ton.`;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: `Favorable pricing renegotiated with ${target.name}`,
          detail: narrative,
          category: "finance",
        },
      };
    },
  },
];
