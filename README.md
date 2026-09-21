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
- **`src/pages`** — Overview, Finance, Operations, Products, **Facilities**,
  Employees (now with promotion, manager reassignment, and reporting-line display),
  Hiring (facility assignment for plant roles once there's more than one site),
  Customers, Suppliers, Competitors, Market, Reports, Company/Ownership, Debug,
  Settings.

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

**Explicitly out of scope for this pass**: the other 14 industries, international
expansion (currency, tariffs, foreign subsidiaries), acquisitions/M&A, configurable
manager authority thresholds (full authority / approval-required / recommendation-
only — the hierarchy's *reporting and performance* mechanics are real, but spending
*authority* levels aren't wired up yet), multi-location inventory (raw materials and
finished goods remain a shared company-wide pool rather than tracked per facility),
and deeper competitor AI (they react to the market, not yet to specific player moves
like a new facility or product launch). These are the natural next phases on top of
a validated, tested core engine.

## Testing

`npm test` runs Vitest coverage of the systems most likely to break silently:
double-entry posting/rejection of unbalanced entries, trial-balance integrity across
mixed transactions, loan amortization to a zero balance, weekly evaluations
generating from real hired-employee data, a JSON save/load round trip that keeps
simulating correctly afterward, a **260-week (5 calendar year) simulated run** that
asserts the accounting identity holds every single week, a dedicated suite for
multi-product/multi-supplier operations (capacity/purchasing allocation always
rebalances to 1, discontinuing a product still sells off remaining inventory, two
product lines against three suppliers stay balanced for 20-30 weeks), a management-
hierarchy suite (management load/capacity/founder-effectiveness are pure,
deterministic functions of company state; promoting a manager measurably improves
founder effectiveness and correctly reassigns unmanaged reports; promotion is
rejected into the wrong department), and a multi-facility suite (a new facility's
costs really do scale by location, capacity aggregates correctly across facilities,
each facility wears down independently based on its own utilization, and running
two facilities with assigned staff for 25 weeks stays balanced throughout) —
matching the design rule that an unbalanced ledger is a bug, never a tolerated
state.
