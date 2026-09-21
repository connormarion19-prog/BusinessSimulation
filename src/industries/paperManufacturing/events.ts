import type { IndustryEventDefinition } from "../../types/industry";
import { chance, nextInt, nextRange } from "../../engine/rng";
import { makeEntry, dr, cr, round2 } from "../../engine/ledger";
import { PAPER_CUSTOMER_SEGMENTS } from "./customers";

let eventCustomerCounter = 0;

/**
 * Events read and react to the company's own history (supplier diversification,
 * maintenance staffing, quality staffing) rather than firing as context-free cards —
 * per the design brief, consequences should trace back to prior decisions.
 */
export const PAPER_EVENTS: IndustryEventDefinition[] = [
  {
    id: "major-supplier-disruption",
    title: "Primary Pulp Supplier Disruption",
    category: "supply-chain",
    severity: "negative",
    baseWeeklyProbability: 0.02,
    eligible: (ctx) => ctx.company.suppliers.length > 0,
    apply: (ctx) => {
      const diversified = ctx.company.suppliers.filter((s) => s.isPrimary === false).length > 0;
      const severityUnits = diversified
        ? Math.round(nextRange(ctx.rng, 15, 40))
        : Math.round(nextRange(ctx.rng, 60, 140));
      const primary = ctx.company.suppliers.find((s) => s.isPrimary) ?? ctx.company.suppliers[0];
      const narrative = diversified
        ? `${primary?.name ?? "Your primary supplier"} had a plant outage this week. Because you also buy from a backup supplier, the shortfall was limited to roughly ${severityUnits} pulp-tons of delayed material.`
        : `${primary?.name ?? "Your primary supplier"} had a plant outage this week and couldn't fill the order at all. With no backup supplier on the books, roughly ${severityUnits} pulp-tons of expected material simply didn't arrive.`;
      ctx.eventFlags.pulpShortfallUnits = (ctx.eventFlags.pulpShortfallUnits ?? 0) + severityUnits;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: "Supplier disruption hit raw material supply",
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
      ctx.market.inputPricePerUnit = round2(ctx.market.inputPricePerUnit * (1 + pctIncrease / 100));
      const narrative = `Pulp markets moved sharply this week — industry-wide input costs jumped about ${pctIncrease}%, pushing your delivered pulp price to $${ctx.market.inputPricePerUnit.toFixed(2)}/ton.`;
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
      ctx.company.customers.push({
        id: `cust-event-${eventCustomerCounter}`,
        name,
        segment: segment.id,
        location: "Regional",
        annualVolumeUnits: annualVolume,
        priceSensitivity: segment.priceSensitivity,
        qualityExpectation: segment.qualityExpectation,
        paymentTermsDays: segment.paymentTermsDays,
        relationshipStrength: 55,
        contractedSince: ctx.week,
        lastOrderWeek: null,
        atRisk: false,
      });
      const narrative = `${name}, a ${segment.name.toLowerCase()}, reached out looking for a new supplier and signed on — roughly ${annualVolume.toLocaleString()} units/year of potential volume if you can consistently deliver.`;
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
      const discountPct = round2(nextRange(ctx.rng, 4, 11));
      ctx.market.inputPricePerUnit = round2(ctx.market.inputPricePerUnit * (1 - discountPct / 100));
      const narrative = `A well-timed negotiation locked in a temporary pulp discount — about ${discountPct}% off the going rate, now $${ctx.market.inputPricePerUnit.toFixed(2)}/ton.`;
      return {
        entries: [],
        narrative,
        historyEvent: {
          week: ctx.week,
          date: ctx.date,
          headline: "Favorable pulp pricing negotiated",
          detail: narrative,
          category: "finance",
        },
      };
    },
  },
];
