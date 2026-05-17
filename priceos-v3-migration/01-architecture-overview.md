# Architecture Overview

## What changed

PriceOS moves from a single-system Lyzr architecture (where 10 agents do everything) to a hybrid architecture:

- **Lyzr** owns orchestration, prompts, conversational surfaces, structured I/O
- **Python service** owns state, learning, determinism, replay, models
- **Tools** are the contract between the two layers

Lyzr agents become thin reasoners. They call Python service endpoints for any computation that requires memory, learning, or determinism.

## Why

The teardown identified that:
- Lyzr cannot natively support stateful learning loops, async retraining, sophisticated backtesting, or custom ML models (shortcoming 18)
- The current architecture loaded too much intelligence into the LLM agents themselves (shortcomings 1, 2, 3, 7, 8, 9)
- Validation is impossible without infrastructure that lives outside the LLM layer (shortcomings 14, 15, 17)

The hybrid model puts each component where its strengths fit. Lyzr is good at LLM orchestration and prompt engineering. Python services are good at databases, models, and replay.

## Impact on product

**For owners**: faster, more reliable pricing decisions. Better explanations because the agent reasons over a learned model rather than a multiplier formula. Audit trail visible on every decision.

**For RMs**: a real operating dashboard with ranked escalations. One RM can manage 150 to 200 properties instead of 30 to 60.

**For founders**: validation becomes possible. Backtest 24 months of Hostaway data overnight. Ship cluster-by-cluster with confidence. Defend against PriceLabs adding AI as a feature, because their architecture cannot do what this one does.

**For engineering**: each layer testable independently. Lyzr changes are prompt edits. Service changes are code with tests and CI. The two evolve at different speeds without coupling.

---

## Before (v2)

```
                    Property Manager
                          |
                          v
               +----------+----------+
               |        Aria         |
               |   (CRO Router,      |
               |   gemini-flash)     |
               |   - 5 PMS tools     |
               |   - Max 3 calls     |
               |   - Routes to subs  |
               +----+----+----+------+
                    |    |    |
       +------------+    |    +-------------+
       |                 |                  |
       v                 v                  v
+---------------+ +---------------+ +-----------------+
| Property      | | Booking       | | Market          |
| Analyst       | | Intelligence  | | Research        |
| (no tools)    | | (no tools)    | | (no tools)      |
+-------+-------+ +-------+-------+ +--------+--------+
        |                 |                  |
        +-----------------+------------------+
                          |
                          v
                  +----------------+
                  |  PriceGuard    |
                  | (veto, no tools|
                  | multiplier math)|
                  +-------+--------+
                          |
                          v
                  +----------------+
                  | Anomaly        |
                  | Detector       |
                  +----------------+

Independent: Maya, Atlas, Conv Summary, Event Intel
```

Problems with v2:
- All data flows through Aria (single point of failure)
- Sub-agents have no memory, no learning
- PriceGuard is a rule engine, not a pricing engine
- No audit trail, no replay, no backtest
- War regime breaks the multiplicative formula
- Validation is impossible

## After (v3)

```
                    Property Manager
                          |
                          v
               +----------+----------+
               |        Aria         |
               |   (Router only,     |
               |   Haiku 4)          |
               |   - workflow lookup |
               |   - composition     |
               +-----+----+----+-----+
                     |    |    |
                     | parallel via Lyzr workflows
                     v    v    v
+----------------+ +-----------+ +----------------+
| Property       | | Booking   | | Market         |
| Analyst        | | Intel     | | Research       |
| - own PMS      | | - own PMS | | - regime tool  |
|   tools        | |   tools   | | - comps tool   |
| (Haiku 4)      | | (Haiku 4) | | (Sonnet 4.6)   |
+-------+--------+ +-----+-----+ +--------+-------+
        |                |                |
        +----------------+----------------+
                         |
                         v
                +-----------------+
                | PriceGuard      |
                | (Sonnet 4.6)    |
                | - elasticity    |
                |   tool          |
                | - exploration   |
                |   tool          |
                | - audit log     |
                +--------+--------+
                         |
                         v
                +-----------------+
                | Anomaly         |
                | Detector        |
                | (Haiku 4)       |
                +-----------------+

Lyzr Side                  ║   Python Service Side
==========================  ║  ========================
- 10 agents (refactored)    ║  - audit_log_decision
- workflow registry         ║  - audit_replay
- JSON output schemas       ║  - elasticity_predict
- prompt caching            ║  - elasticity_update
                            ║  - regime_classify
Independent:                ║  - source_market_get_modifier
- Maya (Haiku 4)            ║  - exploration_select
- Atlas (Sonnet 4.6,        ║  - comps_get_state
   tools added)             ║  - events_get_validated
- Conv Summary (Haiku 4)    ║  - guest_signals_get_summary
- Event Intel (Perplexity)  ║  - backtest_run
                            ║  - rm_dashboard_queue
                            ║
                            ║  Plus: Postgres (audit, snapshots, 
                            ║  outcomes, posteriors, profiles)
                            ║  Plus: Backtest harness
                            ║  Plus: RM dashboard (frontend)
```

## What stays in Lyzr

- All 10 agents keep their identities
- All conversational personas (Aria for property managers, Maya for guests, Atlas for portfolio, Conversation Summary)
- Prompt engineering surface
- Workflow orchestration (parallel and sequential agent invocations)
- JSON schema validation on outputs
- Prompt caching

## What moves to the Python service

- All state and memory (audit log, snapshots, outcomes, posteriors)
- All learning (elasticity model, regime classifier, segment profiles)
- All determinism (composition, validation, replay)
- All bandit/exploration logic
- All comp-set scraping and management
- All event verification and storage
- The backtest harness
- The RM dashboard
- Performance contract baseline computation

## Tool contract

Every Lyzr-resident agent calls Python service endpoints as tools. The tools are documented in `03-service-endpoints.md`. The OpenAPI contract is in `/schemas/openapi-contract.yaml`.

Tool taxonomy:

```
PMS tools (existing, kept as-is)
  get_property_profile
  get_property_calendar_metrics
  get_property_reservations

Service tools (new, this migration)
  audit_log_decision
  audit_replay
  elasticity_predict
  regime_classify
  source_market_get_modifier
  exploration_select
  comps_get_state
  events_get_validated
  guest_signals_get_summary

PMS tools that wrap service (replacements for v2 tools)
  get_property_benchmark   -> wraps comps_get_state
  get_property_market_events -> wraps events_get_validated
  get_nearby_comps         -> wraps comps_get_state
```

## Operational principles

1. **Audit first, intelligence second.** The audit and replay layer is built before any new model. Without it, no model can be validated.
2. **Backtest before forward test.** Replay 24 months of Hostaway history to validate any prompt or constant change. Forward operation is the deployment, not the experiment.
3. **Cluster-by-cluster promotion.** Properties promote from dry-run to live based on per-cluster scorecard, not all at once.
4. **Human RM as labeler, not bottleneck.** Every RM action is captured as labeled training data. The model learns from corrections.
5. **Lyzr does prompts, service does logic.** If a thing needs to be deterministic, replayable, or learning, it lives in the Python service.

## Service technology choices

- **Language**: Python 3.11+
- **API framework**: FastAPI
- **Database**: Postgres 15+ with TimescaleDB extension for time-series
- **Queue**: Celery on Redis (or RQ if simpler is preferred)
- **ML**: PyMC or NumPyro for hierarchical Bayesian models, LightGBM for the regime classifier
- **Scraping**: Playwright headless for Airbnb, HTTPX + lxml for Booking.com, residential proxy pool (Bright Data or Smartproxy)
- **Observability**: PostHog for product, Sentry for errors, structured JSON logs to Datadog or CloudWatch
- **Deployment**: Railway or Fly for backend, Vercel for frontend

## Out of scope for this migration

- Full PMS replacement (Hostaway stays)
- Direct booking site (separate product surface)
- Mobile app for owners (separate product surface)
- Multi-region beyond Dubai (architecture supports it, market entry is a separate decision)
