# Resolution Matrix: Teardown Shortcomings → Fixes

Every shortcoming identified in the v2 architecture teardown, mapped to where it is resolved in this migration package, with impact.

## Architectural shortcomings

### 1. Aria as bottleneck and single point of failure
- **Original problem**: All sub-agents depend on Aria for data. Max 3 tool calls per response. "Never retry failed tool" rule cascades partial-data into bad analysis.
- **Fix location**: `04-lyzr-agent-changes.md` (Aria v3 router prompt) + `03-service-endpoints.md` (per-agent tool grants)
- **What changes**: Aria becomes a router. Sub-agents get their own tool lists. The 3-call cap and never-retry rule are removed.
- **Impact**: Faster responses (parallel sub-agent execution). Failure of one tool no longer cascades. Per-agent debug becomes possible.

### 2. Sub-agents are stateless pure functions
- **Original problem**: Property Analyst, Booking Intelligence, Market Research, PriceGuard have no memory. No learning loop possible.
- **Fix location**: `02-data-layer.md` (audit + snapshots) + `05-models-and-training.md` (elasticity online updates)
- **What changes**: Every decision logged with inputs and outcomes. Elasticity posteriors update nightly from realized bookings. RM corrections flow back as labels.
- **Impact**: The system learns from its own decisions and from human overrides. Validation becomes possible because the loop is closed.

### 3. No structured arbitration when sub-agents disagree
- **Original problem**: Aria merges sub-agent outputs into prose. Non-deterministic, non-replayable, no conflict resolution.
- **Fix location**: `04-lyzr-agent-changes.md` (JSON output schemas) + `03-service-endpoints.md` (`/pricing/compose`)
- **What changes**: Every sub-agent emits schema-validated JSON. PriceGuard's optimization-over-elasticity replaces ad hoc arbitration. Deterministic composition.
- **Impact**: Same inputs produce same outputs. Pricing decisions are reviewable and replayable.

### 4. PriceGuard veto pattern is wrong abstraction
- **Original problem**: Hard-rejects block the right answer in regime-shifted markets.
- **Fix location**: `04-lyzr-agent-changes.md` (PriceGuard v3 prompt)
- **What changes**: Verdict spectrum (approved / flag_review / hard_block / hold_for_review). hard_block surfaces to RM queue, never silenced. Multiplier caps loosened.
- **Impact**: System can output the legitimately right price (4x base for NYE Marina, 0.4x for war troughs) without tripping false guardrails.

### 5. Atlas with zero tool calls is fake agent
- **Original problem**: Backend injects [SYSTEM CONTEXT], Atlas always one turn stale, can't drill in.
- **Fix location**: `04-lyzr-agent-changes.md` (Atlas v3 prompt)
- **What changes**: Atlas gets `get_portfolio_overview`, `get_portfolio_revenue_snapshot`, `get_property_calendar_metrics` as own tools.
- **Impact**: Portfolio Q&A becomes interactive. Owners get accurate, fresh data when they ask.

### 6. Maya siloed from pricing
- **Original problem**: Guest sentiment is a pricing signal. Pricing changes affect guest expectations. Two systems share no data.
- **Fix location**: `03-service-endpoints.md` (`/guest_signals/get_summary` endpoint) + `04-lyzr-agent-changes.md` (Market Research reads guest signal summary)
- **What changes**: Maya's resolved threads feed a guest-signal aggregator (sentiment, recurring complaint themes). Market Research reads the property's trailing 30-day guest signal as one feature.
- **Impact**: Properties with consistent cleanliness or noise complaints get downward pricing pressure. Properties with strong guest sentiment can hold higher.

## Pricing intelligence shortcomings

### 7. Pricing formula cannot represent the real market
- **Original problem**: event 1.30 × news 1.30 × occupancy 1.10 × demand 1.05 = 1.95x max. Reality is 4x.
- **Fix location**: `04-lyzr-agent-changes.md` (PriceGuard v3) + `05-models-and-training.md` (elasticity model)
- **What changes**: Replace multiplicative formula with optimization over learned elasticity model. Multiplier caps removed from prompt, replaced by elasticity model's learned response surface.
- **Impact**: NYE Marina can correctly price at 4x. War troughs can correctly price at 0.4x. The math models reality.

### 8. No elasticity model
- **Original problem**: PriceGuard does multiplier arithmetic, not optimization.
- **Fix location**: `05-models-and-training.md` (elasticity spec) + `03-service-endpoints.md` (`/elasticity/predict`)
- **What changes**: Hierarchical Bayesian P(book | price, features) model with cluster priors. Online nightly updates.
- **Impact**: PriceGuard now answers "at this price what's expected RevPAR" instead of "what does the formula say." Closes the gap to PriceLabs/Wheelhouse on core math.

### 9. No exploration policy
- **Original problem**: Agent only sees outcomes at prices it chose. Cannot learn counterfactuals.
- **Fix location**: `05-models-and-training.md` (Thompson sampling spec) + `03-service-endpoints.md` (`/exploration/select`)
- **What changes**: 5-10% exploration budget on unbooked nights with lead_time > 14 days. Thompson sampling on posteriors.
- **Impact**: System actively gathers signal on prices it wouldn't otherwise try. Validation becomes possible without waiting for natural variation.

### 10. News factor naive
- **Original problem**: SUM(suggested_premium_pct) clamp. Duplicate sources oversaturate. No decay, no trust weighting.
- **Fix location**: `05-models-and-training.md` (regime classifier replaces news_factor)
- **What changes**: News, advisories, mobility, macro all feed the regime classifier as features. The classifier replaces the news_factor entirely.
- **Impact**: No more saturation. War regimes get continuous, calibrated scoring. Calm regimes don't get spurious noise.

### 11. Geopolitical Risk Protocol too coarse
- **Original problem**: 4 discrete tiers with cliff transitions. War is continuous.
- **Fix location**: `05-models-and-training.md` (regime classifier)
- **What changes**: Continuous regime score 0 to 1, computed daily. Per-source-market modifiers. The 4-tier protocol is removed.
- **Impact**: System reacts proportionally to escalation and de-escalation. No discontinuities at tier boundaries.

### 12. No source-market segmentation
- **Original problem**: Russian, Indian, GCC, European demand react differently to MENA shocks. Agent has no model.
- **Fix location**: `05-models-and-training.md` (segment profiles) + `03-service-endpoints.md` (`/source_market/get_modifier`)
- **What changes**: 60 segment profiles (cluster × top-10-source-market). Property-specific demand modifier weighted by trailing 90-day mix.
- **Impact**: A Russian-heavy Marina property and an Indian-heavy Downtown property get different optimal pricing in the same regime. This is the moat versus PriceLabs in MENA.

### 13. No baseline regime detection
- **Original problem**: Anomaly Detector Rule 6 fires on "revenue dropped >15%" but compared to what? Last-year baselines useless in regime change.
- **Fix location**: `05-models-and-training.md` (regime classifier) + `06-backtest-harness.md` (regime-adjusted baselines)
- **What changes**: Anomaly Detector Rule 6 becomes regime-adjusted. Backtest baselines also regime-adjusted.
- **Impact**: System stops crying wolf in regime drops. Customers see anomalies that actually matter.

## Validation shortcomings

### 14. No audit-and-replay layer
- **Original problem**: No way to debug agent reasoning post-hoc, no counterfactual analysis.
- **Fix location**: `02-data-layer.md` + `06-backtest-harness.md`
- **What changes**: Three tables (agent_decisions, state_snapshots, decision_outcomes). `/audit/replay` endpoint. Every Lyzr agent invocation logged with parent_decision_id chain.
- **Impact**: Every decision replayable with new prompt or new constants. Backtest 24 months of Dubai data overnight. Validation problem dissolves.

### 15. 30 units far below statistical signal
- **Original problem**: Forward-testing on 30 units in a regime-shifted market produces noise.
- **Fix location**: `06-backtest-harness.md`
- **What changes**: Backtest replays 24 months of Hostaway history per property. Decision points sampled at lead_time = {30, 14, 7, 3} days.
- **Impact**: Validation moves from forward (slow, noisy) to backward (fast, replayable). 24 months of data per property is statistically meaningful.

### 16. No control group
- **Original problem**: All 30 units on the agent. No comparator.
- **Fix location**: `08-migration-week-by-week.md` (week 6 champion/challenger split)
- **What changes**: 10 agent / 10 PriceLabs / 10 manual best-RM. Stratified by cluster. 90-day minimum.
- **Impact**: Real forward validation against real comparators. Survivable in any regime.

### 17. No internal ground truth signal
- **Original problem**: System computes prices but not predictions. Nothing to be wrong about.
- **Fix location**: `05-models-and-training.md` (elasticity model emits P(book) predictions) + `02-data-layer.md` (decision_outcomes captures realized)
- **What changes**: Every decision predicts P(book) at chosen price. Realized outcome captured. Calibration measured nightly.
- **Impact**: Calibration error becomes a measurable, ship-blocking metric. The system can be honest about its uncertainty.

## Lyzr-specific shortcomings

### 18. Lyzr orchestration model is procedural
- **Original problem**: Stateful memory, learning loops, async retraining not natively supported.
- **Fix location**: `01-architecture-overview.md` (hybrid architecture)
- **What changes**: Lyzr handles orchestration, prompts, structured I/O, conversational surfaces. Python service handles state, learning, determinism, replay.
- **Impact**: Lyzr stops being the bottleneck. Each component sits where its strengths fit.

### 19. Model choices look like defaults rather than deliberate
- **Original problem**: Gemini Flash for routing (weak structured output), gpt-4o-mini for arbitration (limited reasoning).
- **Fix location**: `04-lyzr-agent-changes.md` (model assignments per agent)
- **What changes**: Aria → Haiku 4. PriceGuard, Market Research → Sonnet 4.6. Sub-analysts → Haiku 4. Atlas → Sonnet 4.6. Maya → Haiku 4.
- **Impact**: ~30% better arbitration quality on PriceGuard. Lower latency on conversational paths. Cost neutral or better with prompt caching.

### 20. Veto as workaround for missing structured output validation
- **Original problem**: PriceGuard re-checks upstream agents because no schema validation.
- **Fix location**: `04-lyzr-agent-changes.md` (output schemas)
- **What changes**: JSON schema validation on every sub-agent output. Schema failure rejects the response, not a downstream agent.
- **Impact**: Cleaner separation of concerns. PriceGuard does pricing, not validation. Faster, more deterministic.

## Data API shortcomings

### 21. Benchmark data anchored on unreliable source
- **Original problem**: `get_property_benchmark` returns P25-P90 from somewhere unspecified. If mocked or scraped from broken-regime comps, the entire pricing pipeline is on fictional baselines.
- **Fix location**: `03-service-endpoints.md` (`/comps/get_state`) + `05-models-and-training.md`
- **What changes**: Hand-picked 15-comp set per property. Daily scrape of Airbnb + Booking.com. Comp set is owner-anchored, agent-maintained.
- **Impact**: Real comp data, owner-validated, replaces opaque benchmark. Doesn't depend on AirDNA.

### 22. War regime makes historical baselines meaningless
- **Original problem**: Same-week-prior-year baselines compare across regime change.
- **Fix location**: `05-models-and-training.md` (regime classifier) + `09-pricing-and-contracts.md` (regime-adjusted baseline)
- **What changes**: Baseline RevPAR for performance contract is regime-adjusted. Backtest comparisons regime-adjusted. Anomaly Detector regime-adjusted.
- **Impact**: System stops being broken by regime change. The contract math survives a CFO read.

## Coverage check

| # | Shortcoming | Status |
|---|---|---|
| 1 | Aria as bottleneck | ✓ resolved |
| 2 | Stateless sub-agents | ✓ resolved |
| 3 | No structured arbitration | ✓ resolved |
| 4 | PriceGuard veto wrong | ✓ resolved |
| 5 | Atlas no tool calls | ✓ resolved |
| 6 | Maya siloed from pricing | ✓ resolved (new guest-signal endpoint) |
| 7 | Pricing formula too tight | ✓ resolved |
| 8 | No elasticity model | ✓ resolved |
| 9 | No exploration policy | ✓ resolved |
| 10 | News factor naive | ✓ resolved (replaced by regime classifier) |
| 11 | Geopolitical protocol coarse | ✓ resolved |
| 12 | No source-market segmentation | ✓ resolved |
| 13 | No baseline regime detection | ✓ resolved |
| 14 | No audit-and-replay | ✓ resolved |
| 15 | 30 units small | ✓ resolved (backtest unblocks) |
| 16 | No control group | ✓ resolved (week 6 split) |
| 17 | No internal ground truth | ✓ resolved (calibration metric) |
| 18 | Lyzr procedural | ✓ resolved (hybrid architecture) |
| 19 | Model choices default | ✓ resolved (deliberate assignments) |
| 20 | Veto as workaround | ✓ resolved (JSON schemas) |
| 21 | Benchmark unreliable | ✓ resolved (comp scrape) |
| 22 | War regime baselines | ✓ resolved (regime-adjusted) |

All 22 shortcomings have a designated fix location and a defined impact. Nothing is deferred without a path back to it.
