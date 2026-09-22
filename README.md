# Ledger & Ledger — Business Simulation

A browser-based business-management simulation. Found a company, run it week by week —
purchasing, production, pricing, hiring, financing — and watch decades of decisions
compound into a real (or ruined) balance sheet. This is Phase 1 of a much larger design:
a reusable simulation engine plus one deeply-modeled reference industry, **Paper
Manufacturing**, proving the architecture end to end before more industries are added.

This is **not** a spreadsheet with flavor text. Every number the player sees — revenue,
payroll, inventory, a competitor's estimated market share, an employee's weekly
performance review — is computed from an underlying transaction ledger and a set of
interacting simulation systems. Nothing is hard-coded.

## Running locally

```bash
npm install
npm run dev       # starts the app
npm run build     # typecheck + production build
npm test          # vitest: accounting identity, loan math, hiring, long-horizon sim
```

Everything runs client-side; saves persist to `localStorage` under multiple named slots
(Main Menu → Continue a save).

## Architecture

- **React 19 + TypeScript + Vite + Tailwind + Zustand.**
- **`src/types`** — the full data model: `Company`, `GameState`, `Employee`,
  `IndustryDefinition`, finance types (`JournalEntry`, `IncomeStatement`,
  `BalanceSheet`, ...), events, competitors.
- **`src/engine`** — pure, industry-agnostic simulation systems:
  - `ledger.ts` / `reports.ts` — double-entry posting, trial balance, income
    statement, balance sheet, cash flow, and financial ratios, all computed live
    from `JournalEntry[]`. The accounting identity (Assets = Liabilities + Equity)
    is asserted true on every render and covered by tests, including across a
    260-week (5-year) simulated run.
  - `loans.ts` — real amortization schedules (weekly interest/principal split).
  - `rng.ts` — a seeded PRNG (mulberry32); every random draw in the game goes
    through it, so a given seed reproduces deterministically.
  - `hiring.ts` — candidate generation, resumes, an interview-question bank whose
    answers are a *noisy* signal of hidden traits (charisma can inflate a weak
    answer; a strong candidate can interview modestly), reference checks.
  - `performance.ts` / `evaluation.ts` — weekly employee performance from hidden
    traits + tenure ramp + morale/fatigue, rendered as a written evaluation built
    from that week's actual metrics (units produced, errors caught, collections
    processed) — not a canned template.
  - `events.ts` — rolls an industry's event pool weekly; severity is shaped by the
    company's own history (e.g. a supplier disruption hits harder if you never
    diversified suppliers).
  - `competitors.ts` — AI-controlled rival companies with their own cash, pricing
    strategy, and capacity decisions; can expand, struggle, or go bankrupt.
  - `economy.ts` — a macro cycle (expansion/peak/contraction/trough) driving
    demand, interest rates, and inflation.
  - `causal.ts` — price/volume revenue decomposition and a full profit
    driver breakdown (revenue / COGS / opex / interest / tax), surfaced on the
    Debug tab so "why did profit change?" always has a real, traceable answer.
  - `clock.ts` — the weekly orchestrator: computes the management snapshot, runs
    the industry's `simulateWeek`, amortizes loans, accrues/pays taxes, steps
    competitors and the economy, detects stage/milestone changes, and builds the
    weekly briefing.
  - `management.ts` — organizational hierarchy: management *load* (a weighted
    function of headcount, facilities, active products, customers, suppliers) vs.
    management *capacity* (a founder baseline plus each active manager's own
    skill-scaled contribution) produces a founder-effectiveness multiplier (0.35-1)
    applied to every founder-driven contribution industries make. Promoting an
    employee into a manager role reassigns their department's unmanaged reports to
    them automatically.
  - `facilities.ts` — opens a new facility at a chosen location, scaling its
    lease/utilities/purchase value by that location's real rent index and posting
    a security-deposit entry through the ledger.
  - `delegation.ts` — real delegated decision-making, not a cosmetic toggle. When
    the player grants a manager authority, `runDelegatedPurchasing` periodically
    scores every supplier on price/reliability/quality and gradually reallocates
    purchasing toward whoever's performing better; `runDelegatedHiring` scores open
    candidates against the role (an imperfect read, noisier without an interview on
    file) and hires the best one. Both post a `ManagerDecisionLogEntry` with real,
    computed reasoning, and both respect an authority threshold (a dollar amount of
    purchasing exposure, or a salary ceiling) above which the decision is proposed
    rather than applied, and sits on the Management tab awaiting the player's
    approve/reject.
  - `migrate.ts` — backfills every field added since the original release (capacity
    allocation, supplier allocation, `facilityId`, delegation settings, ...) so a
    save from an earlier phase of the game keeps loading and simulating instead of
    crashing, without altering any of the player's existing data.
- **`src/industries`** — the industry-module system. `IndustryDefinition` is the
  interface every industry implements (products, roles, facilities, suppliers,
  customer segments, event pool, `createInitialState`, `simulateWeek`).
  **`paperManufacturing/`** is the deep reference implementation: pulp purchasing
  split across multiple suppliers by player-set allocation (each negotiating,
  delivering, and drifting price independently), machine + labor capacity shared
  across multiple concurrent product lines (each with its own price, capacity
  allocation, reference market price, and customer segment), defect/scrap loss,
  weighted-average finished-goods costing split into materials/labor/overhead per
  product (so COGS drill-down is real, not decorative), price-elastic spot demand
  blended with relationship-driven contracted customer accounts tied to a specific
  product, and events (supplier disruption, equipment breakdown, pulp price spikes,
  a large new account, a quality complaint wave, a purchasing win) whose odds and
  severity depend on staffing and diversification choices already made — a supplier
  disruption now hits in proportion to how much purchasing volume that specific
  supplier actually carries, not a flat "diversified or not" toggle.
- **`src/data`** — chart of accounts, the 15-industry roster (only Paper
  Manufacturing implemented; the rest are visible as "coming soon" so the intended
  scope is honest from day one), locations, financing sources, name pools.
- **`src/store`** — a Zustand store holding `GameState` and every mutating action
  (advance week, set price, set founder time allocation, post an opening, interview,
  hire, fire, raise, launch/discontinue a product, add/drop/reallocate a supplier,
  promote an employee, reassign a manager, open a facility); nearly all non-trivial
  mutation logic lives in testable `src/engine` functions (`products.ts`,
  `suppliers.ts`, `management.ts`, `facilities.ts`) that the store just calls.
  `saveSlots.ts` handles multi-slot localStorage persistence.
- **`src/pages`** — Overview, Finance, Operations, Products, Facilities,
  Employees (promotion, manager reassignment, span-of-control, reporting-line
  display), Hiring (facility assignment for plant roles, delegation status),
  **Management** (delegated authority per domain, the manager decision log,
  pending approvals, span-of-control table), Customers, Suppliers, Competitors,
  Market, Reports, Company/Ownership, Debug, Settings.

## What's implemented

**Phase 1 foundation + Paper Manufacturing reference industry.** The full loop from
the design brief's "first playable version": choose difficulty, choose an industry
(14 of 15 show as not-yet-implemented, honestly), name the company, pick a location,
a financing source (with real terms shown before you commit), a target customer
segment, a starting product, and a facility; found the company; set price and your
own time allocation across production/purchasing/sales/accounting; advance weeks and
watch purchasing, production, sales, payroll, loan amortization, and tax accrual all
run for real; hire through a real resume/interview/reference-check/offer flow; get a
written weekly performance evaluation built from that employee's actual output;
watch competitors react and the economy cycle; read a full company history log and
long-run KPI charts; inspect the trial balance and the causal breakdown behind any
revenue/profit swing.

**Multi-product operations (Products tab).** Launch additional product lines from
the industry's catalog (e.g. add Kraft Packaging Paper or Specialty Stock alongside
Standard Copy Paper). Each product line has its own price, its own share of the
facility's shared machine + labor capacity (player-adjustable, always rebalanced to
sum to the facility's real capacity), its own finished-goods cost pools and COGS
drill-down, its own reference market price, and its own contracted customer accounts.
Discontinuing a line frees its capacity for the others and stops new production, but
lets remaining inventory sell down rather than vanishing. Diversifying is a genuine
tradeoff — more lines mean more addressable demand, but every line competes for the
same finite capacity and raw-material buffer.

**Supplier diversification (Suppliers tab).** Add a second or third supplier from
the industry's roster and split purchasing across them with sliders (always
rebalanced to sum to 100%). Each supplier has its own price, quality, reliability,
and payment terms, and each negotiates and delivers independently every week — a
reliability failure on one supplier no longer wipes out the whole week's raw-material
delivery if you're sourcing from others too. The event engine reads this directly: a
supplier-disruption event is weighted toward whichever supplier carries the most
volume, and its severity scales with that supplier's actual share of purchasing, so
real diversification (spreading allocation, not just adding a name to a list) is
what limits the damage.

**Management hierarchy & delegation (Employees tab).** Promote an existing
individual contributor into their department's manager role (Production Worker →
Plant Manager, Bookkeeper → Controller, Sales Rep → Sales Manager, Purchasing Agent
→ Purchasing Manager); promotion auto-assigns that department's previously
unmanaged employees to report to them, and the player can reassign anyone to a
different manager afterward. A manager's own skill produces a real, direct-report-
scoped output bonus (not a company-wide blanket buff) — employees who don't report
to a manager don't get their boost. Delegation actually matters mechanically: the
`founderEffectiveness` multiplier (visible on the Overview and Facilities tabs)
degrades as headcount, facilities, active products, customers, and suppliers
outrun what one founder can personally track, and only recovers by promoting or
hiring managers — every founder-driven contribution (production labor, purchasing
negotiation, sales effort, bookkeeping) is scaled by it wherever no delegate exists
for that function. Managers get their own weekly evaluation built from their
actual team's aggregate output/error/morale numbers, with a week-over-week trend
line, not a generic "supervised the floor" line.

**Multi-facility operations (Facilities tab, doubling as basic geographic
expansion).** Open a second (or third) facility at any of the game's locations;
its lease, utilities, and purchase value scale by that location's real commercial-
rent index, so geography has an immediate, ongoing cost consequence. Production
capacity (machine + labor) aggregates across every facility a company owns, but
each facility tracks its own equipment condition and decays independently based on
its own utilization — a new facility with no assigned production staff sits idle
and doesn't wear down. Production-worker/machine-operator hires are assigned to a
specific facility at hire time; every other role (sales, purchasing, accounting,
management, quality, maintenance) serves the whole company regardless of location,
a deliberate scope simplification noted honestly rather than half-implemented.

**Delegated authority & manager decisions (Management tab).** Grant a manager real
authority instead of just a passive skill bonus. For Purchasing and Hiring, set
authority to player-approval (default — identical to having no delegation),
threshold (the manager acts on their own up to a $ amount, bigger moves queue for
your sign-off), or full authority. A delegated purchasing manager periodically
compares suppliers on price/reliability/quality and gradually rebalances allocation
toward whoever's actually performing better — never a lurch, and never touching
allocation the player hasn't authorized. A delegated department manager scores
open candidates (using the role's relevant traits, an interview already on file if
you gathered one, and their own judgment) and hires the best one outright, exactly
as if the player had walked through Hiring themselves — the new employee shows up
on payroll, reports to that manager, and the whole thing is a real posted
transaction, not a cosmetic event. Every delegated decision — auto-approved or
pending — is logged with genuine computed reasoning ("Supplier B's price is
running 12% below Supplier A's... more reliable lately...") on the Management tab,
so the player can always see what a manager did and why, and approve or reject
anything above their authorized threshold.

**Manager span of control.** Every manager has a real capacity for direct reports,
derived from their own leadership/judgment/organization — a strong manager can run
more people than a weak one. Exceeding it visibly degrades their output bonus (down
to a floor) and shows up both in their weekly evaluation narrative and on the
Management tab's span-of-control table, so a company that just keeps stacking
reports onto one manager instead of building another layer actually pays for it.

**Save migration.** Saves from any earlier phase of the game (single-product,
single-supplier, no management hierarchy, no delegation) are backfilled with safe
defaults on load — `engine/migrate.ts` — rather than crashing or silently losing
data; old companies pick up right where they left off with every new system
available to them.

**Regional management.** A new tier-3 role, Regional Operations Manager, oversees
other managers rather than an operational department directly — it reuses the
existing generic delegation/span-of-control hierarchy (`managesDepartment:
"management"`) rather than any bespoke code, matching the design goal that growth
should stress the same organizational systems harder, not require new ones.

**Facility ownership & financing (Facilities tab).** Every facility, new or
existing, is leased, purchased, or built from scratch, and each option is real: a
lease posts a security deposit; a purchase (cash or a real amortizing bank loan)
books Property/Plant & Equipment funded by cash or a new Notes Payable; a
construction project books Construction-in-Progress, takes real weeks to complete,
and contributes zero capacity, staffing, or cost until it's actually placed in
service, at which point it converts to PP&E automatically. Nothing here is a fake
balance-sheet adjustment — every path is a real, balanced set of journal entries.

**Geographic markets & market entry (Market tab).** Every location in the game now
has its own regional demand pool, price level, and competitive pressure — derived
from real, distance-weighted competitor presence (competitors have real home
locations now, not a placeholder) — rather than one shared national pool. A company
can enter a new region four different ways (remote sales, a distributor, a local
warehouse, or a full local facility), each with its own real setup cost and ramp-up
time. Before committing, the player sees a feasibility report — estimated market
size, expected first-year revenue, operating margin, required investment, and
break-even time, all as ranges with real named risks — generated live from the
actual regional-market model, never a canned number. Once active, every entry
tracks real actual-vs-forecast revenue over time so an expansion's performance is
genuinely visible, not just assumed. Regional demand and home demand are rationed
proportionally against available inventory each week, so a home market that alone
exceeds production capacity can't structurally starve every region to zero.

**Internal logistics & multi-location inventory (Facilities tab).** Finished-goods
inventory is now tracked per facility, not just as one company-wide number. Moving
inventory between facilities is a real action with real freight cost (distance-
based) booked immediately and real transit time before it lands, bounded by the
destination's actual storage capacity. Regional sales draw down local warehouse/
factory stock first and only fall back to costlier freight from the nearest
facility when local stock runs out — so pre-positioning inventory via transfers is
a genuine lever, not cosmetic.

**Employee workload & capacity (Employees tab).** The staffing model no longer
assumes one employee equals one job. Every employee — and the founder — has a real
weekly-capacity allocation split across five functions (accounting, purchasing,
sales, operations, administration), independent of their formal department. Four
new startup-oriented generalist roles (Business Generalist, Operations Associate,
Sales & Operations Associate, Finance & Administration Associate) spread that
capacity moderately across several functions with a real, role-specific capability
profile; existing specialists still concentrate ~100% in one. A real workload model
(`engine/workload.ts`) derives required capacity per function from actual company
state — headcount, suppliers, customers, facilities, production volume, open
loans — never a flat "level up" trigger, and compares it against available (raw and
skill-weighted "effective") capacity into a 5-tier staffing-gap readout (large
surplus → critically overloaded) with a donut-chart capacity breakdown and a
workload-vs-capacity bar chart, both driven by the exact same data the weekly
simulation reads. A "Should You Hire?" panel gives a real, information-only
capacity/cost preview per candidate role — never a recommendation. Overallocating
an employee past 100% has real, visible consequences (lower output, more errors,
faster fatigue) via a genuine penalty factor, not a soft cap. The weekly simulation
itself now sums a primary specialist's contribution (unchanged formula — zero
behavior change for existing single-specialist saves) plus a genuinely additive
supplemental contribution from every other employee — chiefly generalists — with
real allocated time in that function, so hiring one generalist visibly changes
purchasing/sales/accounting/production capacity and outcomes, not just a stat
screen. Promotion resets an employee's allocation to their new manager role's
default split, and a generalist's own weekly evaluation narrates their actual time
split from real data, not a scripted line.

**Startup experience & financial drill-down (Phase 4).** A brand-new company now
starts with zero customers and zero suppliers — no relationship is handed to the
player, matching the design brief's "no predetermined customers or suppliers"
requirement. Company creation (`NewGame.tsx`) is a sequential step-by-step wizard
(name → difficulty → industry → location → financing/scale → segment → product →
facility → summary), each step explaining what the choice means and its real
consequence, rather than one long form.

- **Prospecting (Customers tab).** New companies start with a pool of customer
  prospects (`engine/prospecting.ts`) carrying a visible, deliberately imprecise
  estimate (demand range, willingness-to-pay range) around real hidden ground
  truth. Researching a prospect narrows the visible range without ever revealing
  the exact truth. Pitching with real player-chosen terms (price, volume, payment
  terms, contract length) computes a genuine close probability from how the offer
  compares to the prospect's hidden price sensitivity, volume fit, terms, and
  quality bar, plus the company's actual sales capability from the workload
  engine — never a coin flip divorced from the offer made. Winning creates a real
  customer account and posts a real outreach-cost journal entry; losing is
  explained in plain language. The prospect pool refreshes weekly so it never
  runs dry.
- **First supplier (Suppliers tab).** With no supplier, production is genuinely
  stuck at zero — surfaced as an urgent pending decision, not a silent gap. Picking
  a first supplier correctly gives it 100% of purchasing allocation (a real bug
  fixed this pass: previously only ever exercised as a company's second-or-later
  supplier).
- **Financial drill-down & explanation (Finance tab, `engine/financialExplain.ts`).**
  Revenue and COGS are traceable by product directly from tagged journal entries
  (`JournalEntry.productId`, reporting metadata only — never affects balancing),
  not a parallel estimate. A "what changed last week" section attributes the
  revenue/profit delta to real price/volume/cost effects. A "why are we losing
  money" narrative compares actual unit production cost to actual selling price
  whenever the company is unprofitable. A cash-vs-profit explanation grounds the
  difference in real AR/AP/inventory swings, and a cash-runway warning breaks the
  burn rate into its real payroll/supplier-payment/debt-service/collection
  components. `InfoTip` (`components/ui.tsx`) plus `data/financialGlossary.ts` put
  a plain-language definition on every major financial term throughout the app.
- **Organizational pyramid (Management tab, `engine/orgChart.ts`).** A real tree
  built from actual `Employee.managerId` reporting relationships, rooted at the
  founder — not a decorative diagram. Functions that are overloaded with no
  manager owning them (using the same staffing-gap data the Employee dashboard
  reads) appear as explicit vacancy nodes, so an org gap is as visible as an
  org chart.

**The real operating loop (Phase 5): find, negotiate, sell, buy, produce, deliver,
get paid.** The core sales/procurement mechanics were rebuilt around discrete,
inspectable business processes instead of implicit background math.

- **Sales funnel & negotiation (Customers tab, `engine/prospecting.ts`).** A
  prospect now moves through real stages — new → researched → contacted →
  interested → qualified → pitch/negotiation → won/lost — not a flat 5-state
  model. `contactProspect` lets the player pick an outreach method (cold
  outreach/email/phone/in-person meeting) with real, disclosed cost and odds
  differences; `qualifyProspect` confirms real fit before a pitch is allowed
  (skipping research first makes this meaningfully riskier). A near-miss pitch
  no longer just loses — it reveals a real counter-offer computed from the
  prospect's hidden truth, which `acceptProspectCounterOffer` can close outright.
  The UI shows every stage's panel automatically as the prospect advances.
- **Supplier negotiation (Suppliers tab, `engine/supplierNegotiation.ts`).**
  `negotiateSupplierTerms` computes how much a supplier will actually give up
  from how aggressive the ask is relative to their current price, the
  company's purchasing skill, committed volume, and how many rounds this
  relationship has already been renegotiated — a reasonable ask succeeds
  outright, a moderately aggressive one gets a real counter-offer, a wildly
  aggressive one is rejected, and a relationship can't be renegotiated again
  for 4 weeks after a successful round.
- **Real orders, invoices, purchase orders, and bills
  (`engine/orderLedger.ts`).** Every contracted customer's fulfilled weekly
  volume creates a discrete `SalesOrder` + `Invoice` (amount, issue date, due
  date from their own payment terms, status); every supplier delivery creates
  a discrete `PurchaseOrder` + `Bill` the same way. These are reconciled
  against the exact same real dollar amounts the existing, long-horizon-tested
  weekly AR/AP mechanic already computes (oldest-due-first, weighted by each
  customer's own payment reliability) — a faithful, per-transaction *view* of
  real collection behavior, never a second, divergent source of truth.
  Customers gained `paymentReliability`, `ordersFulfilled`/`ordersMissed`, and
  real contract length/end-week fields.
- **Inventory coverage, price scenarios, break-even, and cash forecasting
  (Finance tab, `engine/decisionSupport.ts`).** Real weeks-of-coverage for raw
  materials and each finished-goods line; a price-testing tool projecting
  volume/revenue/gross-profit ranges at a hypothetical price (capped by real
  facility capacity, never telling the player which price to pick); a
  break-even/contribution-margin analysis that explicitly treats only
  materials as variable (labor and overhead are salaried/leased in this game,
  not paid per unit, and that distinction is surfaced rather than hidden); and
  an 8-week cash-flow forecast with a range that widens the further out it
  reaches, built from the same real burn-rate components the existing cash-
  runway warning already used.
- **Business milestones & reputation (`engine/milestones.ts`).** First
  employee hired, first customer signed, first commercial sale, first
  profitable week/month now land in company history as real, permanent
  markers alongside the existing stage-change and revenue-threshold ones —
  historical record, not achievements. `Company.reputation` (0-100, starts
  neutral) rises on winning a customer and falls when one newly goes at-risk,
  nudging pitch odds by a small, bounded amount — built from real history,
  never a player-set slider.
- **Decision queue.** Overdue customer invoices, overdue supplier bills, and
  prospects sitting in an open negotiation now surface as real pending
  decisions alongside the existing ones (cash warnings, staffing gaps,
  manager approvals, etc.) on the Overview dashboard.

**Explicitly out of scope for this pass**: the other 14 industries, international
expansion (currency, tariffs, foreign subsidiaries), acquisitions/M&A, true
per-region pricing (price is still set once per product company-wide, though its
competitiveness is evaluated against each region's own price level), market
research spend to reduce expansion uncertainty, deeper competitor AI reacting to
specific player moves (a new regional entry, a price change) rather than the
market in aggregate, and an Easy-mode rebalance. Also out of scope from Phase 5's
brief specifically: a second raw-material input type (chemicals/packaging —
suppliers still all source the same pulp input); a literal modal-popup framework
for every major decision (the existing, now-expanded Decision Queue plus each
system's own real page serves the same purpose — "SET PRICE" is the Products
page, "BUY MATERIALS" is Suppliers, "ACCEPT CUSTOMER DEAL" is the funnel on
Customers — deliberately, so the game isn't a click-through of popups); explicit
manual weekly production-allocation-by-order (production remains automatic/
formulaic, informed by the same real capacity/inventory data now surfaced on
Finance, rather than requiring a per-order allocation click every week); a
dedicated weekly business-calendar view (the narrative notes, history log, and
decision queue substantially cover "what's happening," but not as a calendar
UI); and granular per-task employee instrumentation beyond the existing weekly
performance/evaluation system, which already serves the same purpose. These are
the natural next phases on top of a validated, tested core engine.

## Testing

`npm test` runs 118 Vitest cases covering the systems most likely to break silently:
double-entry posting/rejection of unbalanced entries, trial-balance integrity,
loan amortization to a zero balance, weekly evaluations generating from real
hired-employee data, a JSON save/load round trip, a **260-week (5 calendar year)
simulated run** asserting the accounting identity every single week, multi-product/
multi-supplier operations (allocation always rebalances to 1, discontinuing a
product still sells off inventory, two product lines against three suppliers stay
balanced for 20-30 weeks), management hierarchy (load/capacity/founder-effectiveness
are pure deterministic functions of company state; promoting a manager improves
founder effectiveness and correctly reassigns reports; wrong-department promotion is
rejected), multi-facility operations (a new facility's costs scale by location,
capacity aggregates correctly, each facility wears independently, two facilities
with staff stay balanced for 25 weeks), **delegation** (manual mode is provably
unaffected by delegation settings at their default; full-authority purchasing
gradually shifts allocation toward the better-scoring supplier and logs why;
a reallocation or hire beyond the authorized threshold is proposed, not applied,
until the player approves or rejects it; a rejected hire leaves the opening
genuinely open; both domains together stay balanced for 26 weeks), and **save
migration** (a fixture shaped like the very first release — no delegation, no
per-facility employees, no multi-product fields, no Phase 3 geography/logistics
fields at all — is backfilled correctly and can keep simulating with a balanced
ledger). **Phase 3 expansion** adds its own suite: facility purchase/loan/
construction financing books the right accounts and a construction project
contributes no capacity until it converts to PP&E on schedule; a remote market
entry ramps up on time and accrues real, attributed regional revenue; a warehouse
entry opens a real zero-capacity distribution facility; double-entering the same
market is refused and exiting stops further ramp-up; internal transfers deduct
source inventory immediately, respect destination storage capacity, and land at
the destination only after real transit time; and a **110-week two-facility,
two-region integration run** asserts the accounting identity *and* that every
product's per-facility inventory (plus anything in transit) always reconciles
with its pooled sellable total. **The employee workload/capacity redesign** adds
21 more cases: company workload scales with real growth and stays deterministic;
capacity correctly adds on hire and removes on fire; the 5-tier staffing-status
classification; generalist vs. specialist affinity profiles genuinely differ;
overallocation penalizes output/error-rate measurably; founder allocation maps
onto the same 5-function model; hire-impact previews correctly spread (generalist)
or concentrate (specialist) capacity; promotion resets allocation to the new
role's default; and two integration tests proving that hiring a generalist and
reallocating an employee's time both visibly change simulated output over
15-30 weeks. **The Phase 4 startup rewrite** adds `tests/startup.test.ts` (14
cases): a brand-new company starts with zero customers and zero suppliers;
production genuinely stays at zero with no supplier; a tiny ($15k) starting
capital stays balanced; researching a prospect narrows its visible estimate
without revealing the hidden truth; a well-matched pitch wins substantially
more often than a lowball or overpriced one (a statistical test over 40 trials
per scenario); a won pitch creates a real customer account; and a full 25-week
build-from-scratch run (zero suppliers/customers → first supplier → first won
customer → running business) stays balanced throughout. Existing tests that
implicitly relied on a free starting supplier now go through a small wrapper
(`tests/testHelpers.ts` `createTestGame`) that adds one explicitly, so the
~50 pre-existing `createNewGame` call sites needed no individual rewrite.
**Phase 5's operating loop** adds six more suites (30 cases):
`salesFunnel.test.ts` (contact/qualify gating and odds, a real negotiable
near-miss revealing a counter-offer that always closes on accept);
`supplierNegotiation.test.ts` (a reasonable ask succeeds and genuinely moves
price, a wildly aggressive one is flatly rejected, a moderate one gets a real
counter, minimum-order and 4-week cooldown are enforced);
`ordersAndInvoicing.test.ts` (every delivery/fulfillment creates a real PO+bill
or order+invoice with a correct due date, invoiced payments never exceed real
AR collected, overdue flagging); `decisionSupport.test.ts` (inventory coverage,
price-scenario volume direction and capacity clamping, break-even's fixed/
variable split, cash-forecast range widening over time); `milestones.test.ts`;
and `phase5Integration.test.ts`, a single end-to-end run from a truly empty
company through find supplier → negotiate → materials ordered/received → find
and win a customer through the real funnel → production → real invoice →
invoice paid → bill paid → COGS/gross-profit/net-income reconciling → the
accounting identity holding at every step. Getting this last test
deterministic surfaced and fixed a real pre-existing issue: `createNewGame`
seeds its own RNG from `Date.now()`/`Math.random()` by design (so real
gameplay is never identically seeded), which makes any single-shot test that
hard-asserts a probabilistic win/loss outcome flaky — fixed by pursuing
prospects biggest-first with a fallback to the next one on a dead end (real
founder behavior, not test-rigging) and asserting "at least one won" where a
genuine random event could add a second. An unbalanced ledger is treated as a
bug, never a tolerated state, anywhere in this suite.
