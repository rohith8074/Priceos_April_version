# PriceOS v3 Migration Package

This folder contains the full migration plan from the current Lyzr-based PriceOS v2 architecture to the v3 hybrid architecture (Lyzr for orchestration, Python service for intelligence).

## How to read this folder

Read in this order:

1. `00-RESOLUTION-MATRIX.md` — every shortcoming from the architecture teardown mapped to its fix. Read this first to understand scope.
2. `01-architecture-overview.md` — before/after of the system, what stays in Lyzr, what moves to your service.
3. `02-data-layer.md` — the foundation. Audit log, state snapshots, outcomes. Build this in week 1.
4. `03-service-endpoints.md` — the Python service contract that Lyzr agents will call.
5. `04-lyzr-agent-changes.md` — every agent prompt rewrite plus workflow registry.
6. `05-models-and-training.md` — elasticity model, regime classifier, cluster definitions, labeling protocol.
7. `06-backtest-harness.md` — the validation engine. Build this in week 2.
8. `07-rm-dashboard.md` — the human RM operating surface.
9. `08-migration-week-by-week.md` — the 8-week build plan.
10. `09-pricing-and-contracts.md` — productization, performance contract template, tier structure.
11. `10-rm-role.md` — hiring profile, 90-day ramp, compensation.

Schemas in `/schemas/` are the SQL, JSON, and OpenAPI files referenced by the specs.

## Format of every spec file

Each file opens with three sections:

- **What changed** — the concrete delta vs the current build
- **Why** — which teardown shortcoming(s) this addresses
- **Impact on product** — what customers, owners, RMs experience differently

Then the actual spec content. Engineers can scan the first three sections to plan, then read deeply.

## Build philosophy

The instrumentation comes first. Without the audit log and the backtest harness, nothing else can be validated. Build in this order:

```
Week 1:  Data layer (audit, snapshots, outcomes)
Week 2:  Backtest harness (replay over 24 months Hostaway)
Week 3:  Lyzr agent rewrites (prompts, tools per agent, workflows)
Week 4:  Elasticity model v0
Week 5:  Regime classifier + source-market modifiers
Week 6:  Exploration bandit + RM dashboard + champion/challenger split
Week 7:  Hierarchical Bayesian elasticity
Week 8:  Tighten, validate, ship cluster-by-cluster
```

Do not skip ahead. Each week's work depends on what came before.

## What this package does NOT include

- Hostaway PMS integration code (already exists in v2, keep it)
- Channel sync agent (already exists, keep it)
- Frontend/UI code beyond dashboard layout specs
- Lyzr Studio account configuration
- Customer onboarding flow code
- Marketing site

## Owner of each section

| Section | Primary owner |
|---|---|
| Data layer | Backend engineer |
| Service endpoints | Backend engineer + ML engineer |
| Lyzr agents | Founder + Backend engineer (prompt work) |
| Models | ML engineer |
| Backtest harness | ML engineer |
| RM dashboard | Fullstack engineer |
| Migration plan | Founder (PM) |
| Pricing/contracts | Founder |
| RM role | Founder + Operations |

## Questions

If anything in this package is ambiguous, the answer should default to: build the simplest version that lets you measure correctness via the backtest harness. The harness is the arbiter.
