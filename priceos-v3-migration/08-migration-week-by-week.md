# Migration Plan: Week by Week

## What changed

Eight-week sequenced migration from v2 (Lyzr-only) to v3 (hybrid). Each week has explicit Build, Throw Away, Keep, Risk, and Validation gates.

## Why

Resolves the implementation concern in shortcoming 18 (Lyzr orchestration is procedural) by sequencing the build to never break working production while moving intelligence to the Python service.

## Impact on product

- Production stays operational throughout migration
- Each week's work depends only on prior weeks (no week N depends on week N+2)
- By week 2 you know whether v3 is salvageable (backtest scorecard)
- By week 6 first cluster ships to live mode

---

## Week 1 — Instrumentation

### Build
- `agent_decisions`, `state_snapshots`, `decision_outcomes` tables (run `schemas/audit-schema.sql`)
- `audit_log_decision` endpoint (POST)
- `state_snapshotter` service (eager snapshot per decision)
- Hostaway webhook listener for booking outcomes
- decision_id propagation contract documented and reviewed by team

### Lyzr deltas
- Add `audit_log_decision` tool to all 10 agents in Lyzr Studio
- Add prompt rule to every agent: "Always call audit_log_decision as your final tool call before returning"
- Add `parent_decision_id` passthrough to sub-agent invocations

### Throw away
- Nothing yet.

### Keep
- All 10 agents as they currently are.

### Risks
- Agents forget to log → mitigation: schema validation rejects responses without `audit_decision_id`
- Snapshot bloat → mitigation: storage trivial at 30 properties, revisit at 500

### Validation gate
- Spot check: every Aria invocation has 1 row + N child rows
- Replay endpoint can reconstruct any decision's input state
- 5 known-buggy past decisions are replayable end-to-end

### Owner: Backend engineer

---

## Week 2 — Backtest harness

### Build
- `/audit/replay` endpoint (mode=backtest)
- Backtest runner: walks 24mo of Hostaway data per property, sampling decision points at lead_time = {30, 14, 7, 3} days
- Counterfactual scorer (uses placeholder elasticity = comp-median proximity heuristic until week 4)
- Per-property scorecard generator
- `evaluation_runs` table populated by first nightly run

### Lyzr deltas
- None.

### Throw away
- Nothing.

### Keep
- Existing prompts (they're being measured, not changed)

### Risks
- Backtest reveals catastrophic bugs → that's the point
- Replay non-determinism from temperature 0.2 on Aria → mitigation: set temp=0 for backtests, accept this is approximation

### Validation gate
- First scorecard prints with per-property RevPAR delta of agent-vs-actual
- You will see the multiplier ceiling clipping NYE in week 1 of backtest output
- You will see news_factor flooring war-period weeks
- Document these as expected and motivating week-3 fixes

### Owner: ML engineer + backend engineer

---

## Week 3 — Lyzr config fixes (the throw-away week)

### Build
- Per-agent JSON output schemas
- Workflow registry as JSON (`schemas/workflow-registry.json`)

### Lyzr deltas
- Aria: drop 5 PMS tools, drop "11-section format", drop "max 3 tool calls", drop "never retry failed tool". Replace with router prompt v3.0.
- Property Analyst: gain `get_property_calendar_metrics`, `get_property_reservations` as own tools.
- Booking Intelligence: gain `get_property_reservations`, `get_property_benchmark` as own tools.
- Market Research: prompt rewritten, no news_factor, no positioning verdict. Tools: `comps_get_state`, `events_get_validated` (these are stubs until week 5).
- PriceGuard: prompt rewrite v3.0. Hard reject becomes hard_block (surfaced, not silenced). Multiplier caps loosened.
- Atlas: gain portfolio tools as own. Drop [SYSTEM CONTEXT] injection.
- All sub-agents: switch to deliberate per-agent model assignments per `workflow-registry.json`.
- Use Lyzr workflows for parallel sub-agent execution on `pricing_decision` and `full_analysis` intents.

### Throw away
- News_factor SUM-then-clamp logic (entire concept)
- Tier-based geopolitical protocol (entire concept, replaced by stub regime call)
- PriceGuard veto hard-rejects (becomes hard_block surfaced to RM)
- "Pre-flight checks" embedded in Aria
- 11-section format template

### Keep
- All 10 agent identities
- Maya entirely
- Conversation Summary entirely
- Anomaly Detector with refactored Rule 6 deferred to week 5

### Risks
- Refactor breaks Hostaway push integration → mitigation: keep Channel Sync Agent untouched
- Stronger model on PriceGuard increases cost → mitigation: measure tokens, prompt cache aggressively, expect 2-3x cost at this stage which is fine
- Stub `comps_get_state` and `events_get_validated` return empty → mitigation: agents handle empty gracefully via prompt fallback

### Validation gate
- Re-run backtest on new prompts
- Scorecard should improve on NYE / event nights (multiplier ceiling lifted)
- Scorecard may regress slightly on calm weeks (loss of simple heuristic) — acceptable, week 4 fixes

### Owner: Founder + backend engineer (prompts) + ML engineer (schemas)

---

## Week 4 — Elasticity v0

### Build
- Logistic regression elasticity model with cluster priors (pooled, not yet hierarchical-Bayesian)
- Train on 24mo Hostaway history per cluster
- `/elasticity/predict` endpoint
- PriceGuard switches from "compute price" to "optimize over model"
- `elasticity_posteriors` storage table populated

### Lyzr deltas
- PriceGuard prompt: replace internal multiplier formula with `elasticity_predict` tool call loop
- Add candidate_price construction logic to PriceGuard prompt

### Throw away
- Hardcoded multiplier formula in PriceGuard
- "Professional Sanity Protocol" with bedroom-aware AED limits (subsumed by elasticity model + ceiling guardrail)

### Keep
- Floor and ceiling guardrails (still hard, still per property)
- Max daily and weekly drift guardrails
- Anomaly Detector

### Risks
- Cold start on properties with sparse history → mitigation: cluster prior shrinks gracefully
- Logistic regression undersells highly nonlinear behavior near NYE / Eid → mitigation: explicit event interaction terms in feature set, week 5 elaborates with hierarchical Bayes

### Validation gate
- Backtest scorecard: RevPAR delta per cluster
- Calibration plot: predicted vs realized P(book) at deciles
- Compare to week 3 scorecard, expect material improvement on event nights and on properties with rich history

### Owner: ML engineer

---

## Week 5 — Regime classifier + source-market modifiers

### Build (over the weekend, parallel to weekday work)
- Hand-label 24 months of Dubai weeks (104 rows, ~14 hours)
- Train regime classifier (LightGBM regression on labels)
- First-party features only first (cheapest, fastest signal)
- Add news + advisory features incrementally

### Build (weekdays)
- 60 segment profiles trained from Hostaway 24mo
- `/regime/classify` endpoint
- `/source_market/get_modifier` endpoint
- Cluster assignment job for the 30 properties
- Comp set scrape v0 (Airbnb only, 15 comps per property)
- `/comps/get_state` and `/events/get_validated` go from stubs to real implementations

### Lyzr deltas
- Market Research prompt v3.0 (the rewrite)
- Anomaly Detector Rule 6 changes from "revenue dropped >15%" to "regime-adjusted revenue dropped >15%"

### Throw away
- 4-tier geopolitical risk protocol (replaced by continuous score)
- Hardcoded weekend definitions per market (move to per-property config from cluster default)

### Keep
- Anomaly Detector rules 1-5
- Event Intelligence Agent (now feeds events_get_validated with confidence threshold)

### Risks
- Regime classifier overfits 24mo Dubai data → mitigation: temporal cross-validation, hold out last 3 months
- Source-market mix unstable for low-volume properties → mitigation: 90-day window, fallback to cluster default
- Comp scrape blocked by Airbnb anti-bot → mitigation: residential proxies, jittered request timing, accept 70-80% successful daily refresh as v0 OK

### Validation gate
- Regime score on labeled holdout: MAE within 0.1
- Per-segment modifier inversely correlates with portfolio cancellation rate
- Backtest scorecard improves on war-regime weeks specifically

### Owner: ML engineer + analyst (labeling) + backend engineer (scrape infrastructure)

---

## Week 6 — Exploration + RM dashboard + champion/challenger launch

### Build
- `/exploration/select` endpoint with Thompson sampling
- 5% exploration budget per property per month, configurable
- Human RM dashboard (per `07-rm-dashboard.md`)
- `rm_actions` audit table populated
- Cluster-stratified split of 30 units: 10 agent / 10 PriceLabs / 10 manual best-RM
- Daily memo template for owners
- `property_promotion_status` table for cluster-by-cluster promotion

### Lyzr deltas
- PriceGuard: add `exploration_select` call after exploit choice
- Aria: add escalation routing prompt (when verdict is hard_block or hold_for_review, surface to RM dashboard with revenue impact)

### Throw away
- Nothing.

### Keep
- Everything from prior weeks.

### Risks
- Exploration loses revenue on probed nights → mitigation: only on unbooked nights with lead_time > 14, capped at 5% of unbooked-night-inventory
- 30-unit split is statistically tight → mitigation: stratify by cluster, run 90 days minimum, accept directional signal
- RM dashboard adoption slow if RM is hired late → mitigation: founder runs dashboard for first 2 weeks

### Validation gate
- First 30 days: agent cluster RevPAR vs PriceLabs cluster vs manual cluster
- RM dashboard load time, action throughput per RM-hour
- Override rate trending (target <15% after 60 days)

### Owner: Fullstack engineer (dashboard) + ML engineer (exploration) + founder (split design)

---

## Weeks 7-8 — Tighten and validate

### Build
- Hierarchical Bayesian elasticity model (upgrade from pooled logistic regression)
- Source-market profile retraining job
- Backtest harness regression suite (every prompt change runs nightly backtest, scorecard auto-posted)
- Customer-facing diagnosis report generator (uses backtest output as the proof point)
- `/backtest/inspect/<run_id>` endpoint for engineers
- Adversarial test scenarios (synthetic shocks, see `06-backtest-harness.md`)

### Lyzr deltas
- Final pass on Aria, PriceGuard, Market Research prompts based on backtest learnings
- Confidence threshold tuning per cluster

### Throw away
- Any prompt blocks the backtest shows as net-negative
- Pooled logistic regression elasticity (replaced by hierarchical Bayesian)

### Keep
- The audit-replay-backtest core (this is the asset)

### Risks
- Hierarchical model fails to converge → mitigation: NumPyro or PyMC, separate ML notebook outside Lyzr
- Customer demo flow over-promises uplift before champion/challenger has run 60 days → mitigation: demo shows backtest delta, not forward projection, with clear "results may vary in current regime" caveat

### Validation gate
- Backtest scorecard stable across 3+ consecutive nightly runs
- Calibration error <10% on holdout
- First champion/challenger results inform whether to scale to next 50 properties

### Owner: ML engineer + founder

---

## Cumulative deliverables by end of week 8

```
Infrastructure
  ☑ audit_decisions, state_snapshots, decision_outcomes (week 1)
  ☑ replay endpoint (week 2)
  ☑ backtest harness with nightly evaluation (week 2 + 7-8)
  ☑ exploration bandit (week 6)

Models
  ☑ elasticity (pooled v0 week 4, hierarchical v1 week 7-8)
  ☑ regime classifier (week 5)
  ☑ source-market profiles (week 5)
  ☑ cluster definitions (week 5)

Lyzr changes
  ☑ All 10 agents at v3.0 prompts (week 3)
  ☑ Per-agent tool grants (week 3)
  ☑ JSON output schemas (week 3)
  ☑ Workflow registry for Aria (week 3)
  ☑ Model assignments per agent (week 3)
  ☑ Parallel execution workflows (week 3)
  ☑ Audit log calls in every agent (week 1)

Operations
  ☑ Comp set scrape (Airbnb) for all 30 properties (week 5)
  ☑ RM dashboard live (week 6)
  ☑ Champion/challenger split running (week 6 + 60 days)
  ☑ Daily memos to owners (week 6)
  ☑ Diagnosis report generator (week 7-8)

Outcomes
  ☑ Validation problem resolved (week 2 backtest is the answer)
  ☑ At least 2 clusters promoted to live (week 8)
  ☑ Override rate <15% on promoted clusters (week 8)
  ☑ First measurable RevPAR uplift on agent cluster vs control (week 8)
```

## What is NOT done by week 8

- AirDNA integration (deliberately deferred per founder decision)
- Multi-region beyond Dubai (Abu Dhabi, Sharjah follow once Dubai is stable)
- Advanced channel-level pricing (direct vs OTA markup logic) is a separate workstream
- Owner-facing self-service portal (current model is RM-mediated)
- Tier 3 (Managed RM) full launch — wait until RM hired and trained, week 12+
