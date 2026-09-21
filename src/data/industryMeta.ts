import type { IndustryMeta } from "../types/industry";

/**
 * All 15 industries the game intends to support. Only entries with
 * `implemented: true` have a real IndustryDefinition in src/industries and
 * can be started; the rest appear in the company-creation picker as
 * "coming soon" so the roster is visible from day one.
 */
export const INDUSTRY_META_LIST: IndustryMeta[] = [
  {
    id: "paper-manufacturing",
    name: "Paper Manufacturing",
    tagline: "Turn pulp into paper, one ton at a time.",
    description:
      "A commodity-adjacent manufacturer converting purchased wood pulp into paper products (copy paper, packaging paper, specialty stock). Capital-intensive, exposed to input-price swings, and won mostly on cost, reliability, and contract relationships.",
    startingCapitalRange: [40_000, 400_000],
    implemented: true,
  },
  {
    id: "furniture-manufacturing",
    name: "Furniture Manufacturing",
    tagline: "Design, build, and ship furniture people live with for a decade.",
    description: "Batch and custom furniture production with skilled woodworking labor, material-heavy costs, and long sales cycles for larger orders.",
    startingCapitalRange: [30_000, 300_000],
    implemented: false,
  },
  {
    id: "food-beverage-manufacturing",
    name: "Food & Beverage Manufacturing",
    tagline: "Perishable inventory, thin margins, strict inspections.",
    description: "Packaged food or beverage production under health regulation, short shelf life, and retailer/distributor relationships that make or break volume.",
    startingCapitalRange: [40_000, 350_000],
    implemented: false,
  },
  {
    id: "electronics-manufacturing",
    name: "Electronics / Light Industrial Manufacturing",
    tagline: "Assemble components into products the market obsoletes fast.",
    description: "Light assembly manufacturing exposed to global component supply chains, rapid technology turnover, and quality-sensitive B2B customers.",
    startingCapitalRange: [50_000, 500_000],
    implemented: false,
  },
  {
    id: "accounting-services",
    name: "Accounting / Professional Services",
    tagline: "Sell expertise and billable hours, not inventory.",
    description: "A professional-services firm built on billable utilization, client retention, and staff certification — almost no physical capital required.",
    startingCapitalRange: [10_000, 80_000],
    implemented: false,
  },
  {
    id: "consulting",
    name: "Consulting",
    tagline: "Your reputation is the balance sheet.",
    description: "Project-based advisory work driven by relationships, referrals, and utilization; scales through hiring and specialization, not equipment.",
    startingCapitalRange: [10_000, 100_000],
    implemented: false,
  },
  {
    id: "software-saas",
    name: "Software / SaaS",
    tagline: "Build it once, sell it forever — if anyone renews.",
    description: "Subscription software with high upfront development cost, near-zero marginal cost per customer, and churn as the defining metric.",
    startingCapitalRange: [15_000, 250_000],
    implemented: false,
  },
  {
    id: "financial-services",
    name: "Financial Services",
    tagline: "Trust, capital, and regulation define everything.",
    description: "A regulated financial-services business (lending, advisory, or insurance-adjacent) where licensing, capital requirements, and reputation gate growth.",
    startingCapitalRange: [100_000, 1_000_000],
    implemented: false,
  },
  {
    id: "grocery-retail",
    name: "Grocery / Specialty Grocery",
    tagline: "Thin margins, high volume, and a store that never really closes.",
    description: "A retail grocery operation living on inventory turnover, shrink control, and foot traffic driven by location and price perception.",
    startingCapitalRange: [50_000, 400_000],
    implemented: false,
  },
  {
    id: "clothing-retail",
    name: "Clothing / Apparel Retail",
    tagline: "Buy the trend right, or sit on the markdown rack.",
    description: "Fashion retail where seasonal buying decisions, markdowns, and brand positioning matter as much as the storefront itself.",
    startingCapitalRange: [30_000, 250_000],
    implemented: false,
  },
  {
    id: "electronics-retail",
    name: "Electronics / Specialty Retail",
    tagline: "Sell products the internet also sells, cheaper.",
    description: "Specialty electronics retail competing on service, expertise, and availability against fast, low-margin online competitors.",
    startingCapitalRange: [40_000, 300_000],
    implemented: false,
  },
  {
    id: "construction",
    name: "Construction",
    tagline: "Bid it right, staff it right, or lose money building it.",
    description: "A general or specialty contracting business run project-to-project, bidding against competitors and managing labor, materials, and schedule risk on each job.",
    startingCapitalRange: [40_000, 400_000],
    implemented: false,
  },
  {
    id: "real-estate",
    name: "Real Estate",
    tagline: "Buy, hold, develop, or flip — the market decides the rest.",
    description: "Property acquisition, development, and portfolio management, driven by financing structure, local market cycles, and long holding periods.",
    startingCapitalRange: [100_000, 2_000_000],
    implemented: false,
  },
  {
    id: "logistics-transportation",
    name: "Logistics / Transportation",
    tagline: "Move other people's stuff, reliably, for a price they'll pay again.",
    description: "A trucking or freight-brokerage operation where fuel costs, driver retention, and equipment utilization set the margin.",
    startingCapitalRange: [50_000, 400_000],
    implemented: false,
  },
  {
    id: "hospitality-restaurant",
    name: "Hospitality / Restaurant",
    tagline: "Perishable everything, staffed by people who can walk out any shift.",
    description: "A restaurant or small hospitality operation defined by razor-thin margins, staff turnover, and reputation built one visit at a time.",
    startingCapitalRange: [40_000, 350_000],
    implemented: false,
  },
];

export const INDUSTRY_META_BY_ID: Record<string, IndustryMeta> = Object.fromEntries(
  INDUSTRY_META_LIST.map((i) => [i.id, i]),
);
