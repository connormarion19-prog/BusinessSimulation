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
  - `clock.ts` — the weekly orchestrator: runs the industry's `simulateWeek`,
    amortizes loans, accrues/pays taxes, steps competitors and the economy,
    detects stage/milestone changes, and builds the weekly briefing.
- **`src/industries`** — the industry-module system. `IndustryDefinition` is the
  interface every industry implements (products, roles, facilities, suppliers,
  customer segments, event pool, `createInitialState`, `simulateWeek`).
  **`paperManufacturing/`** is the deep reference implementation: pulp purchasing
  with supplier reliability risk, machine + labor capacity constraints, defect/scrap
  loss, weighted-average finished-goods costing split into materials/labor/overhead
  (so COGS drill-down is real, not decorative), price-elastic spot demand blended
  with relationship-driven contracted customer accounts, and six events (supplier
  disruption, equipment breakdown, pulp price spikes, a large new account, a quality
  complaint wave, a purchasing win) whose odds and severity depend on staffing and
  diversification choices already made.
- **`src/data`** — chart of accounts, the 15-industry roster (only Paper
  Manufacturing implemented; the rest are visible as "coming soon" so the intended
  scope is honest from day one), locations, financing sources, name pools.
- **`src/store`** — a Zustand store holding `GameState` and every mutating action
  (advance week, set price, set founder time allocation, post an opening, interview,
  hire, fire, raise); `saveSlots.ts` handles multi-slot localStorage persistence.
- **`src/pages`** — Overview, Finance, Operations, Employees, Hiring, Customers,
  Suppliers, Competitors, Market, Reports, Company/Ownership, Debug, Settings.

## What's implemented (Phase 1 + Paper Manufacturing)

The full loop from the design brief's "first playable version": choose difficulty,
choose an industry (14 of 15 show as not-yet-implemented, honestly), name the
company, pick a location, a financing source (with real terms shown before you
commit — loan payment estimate or equity dilution, not just a number), a target
customer segment, a starting product, and a facility; found the company; set price
and your own time allocation across production/purchasing/sales/accounting; advance
weeks and watch purchasing, production, sales, payroll, loan amortization, and tax
accrual all run for real; post a job opening, review resumes, ask interview
questions, run a reference check, hire; get a written weekly performance evaluation
built from that employee's actual output; watch competitors react and the economy
cycle; read a full company history log and long-run KPI charts; inspect the trial
balance and the causal breakdown behind any revenue/profit swing.

**Explicitly out of scope for this pass** (per the brief's own phasing): the other 14
industries, international expansion, acquisitions/M&A, a management hierarchy above
"founder → individual contributor" (no manager-of-managers yet), multi-facility /
multi-product operations, supplier switching/diversification UI (the event system
already reacts to diversification, but there's no UI action to add a second supplier
yet), and deeper competitor AI (they react to the market, not yet to specific player
moves). These are the natural next phases on top of a validated core engine.

## Testing

`npm test` runs Vitest coverage of the systems most likely to break silently:
double-entry posting/rejection of unbalanced entries, trial-balance integrity across
mixed transactions, loan amortization to a zero balance, weekly evaluations
generating from real hired-employee data, a JSON save/load round trip that keeps
simulating correctly afterward, and — the most load-bearing test — a **260-week (5
calendar year) simulated run that asserts the accounting identity holds every single
week**, matching the design rule that an unbalanced ledger is a bug, never a
tolerated state.
