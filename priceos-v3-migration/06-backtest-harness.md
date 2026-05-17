# Backtest Harness and Ship Criteria

## What changed

A nightly backtest harness replays every prompt or constant change against 24 months of Hostaway history. Three layers of metrics with explicit ship and fail thresholds. Cluster-by-cluster promotion policy.

## Why

Resolves shortcomings:
- 14 (no audit-replay): the harness consumes the audit infrastructure
- 15 (30 units small): backtests over 24mo of history give statistical signal that 30 units forward cannot
- 17 (no ground truth): calibration error becomes a measurable, ship-blocking metric

## Impact on product

- Validation problem dissolves. Backtest 24 months overnight, scorecard by morning.
- Every prompt change is regression-tested before it ships
- Ship readiness becomes a data point ("layer 1 is +6% on this cluster across 7 nightly runs"), not a vibe
- Customer-facing diagnosis report quotes specific dirhams from backtest, not projections

---

## Architecture

```
                  Backtest Harness
                         │
                         v
              ┌──────────┴──────────┐
              │                     │
              v                     v
     /audit/replay loop      /elasticity/predict
       (per decision)            (per candidate)
              │                     │
              └──────────┬──────────┘
                         v
                  Per-decision diff
                         │
                         v
               Aggregation per cluster
                         │
                         v
                Scorecard (3 layers)
                         │
                         v
              evaluation_runs table
                         │
                         v
                  Ship-status check
                  (READY | WATCH | BLOCKED)
```

The harness is a Python script run nightly via cron or Celery beat.

---

## Three layers of metrics

### Layer 1: Backtest performance (the headline)

```
Per cluster:
  revpar_delta_pct        median, p25, p75 across properties in cluster
  occupancy_delta_pp      percentage points
  net_revenue_delta_aed   absolute, summed across cluster

Ship: revpar_delta_pct median ≥ +5% per cluster, p25 ≥ 0%
Fail: revpar_delta_pct median negative on any cluster after 6 weeks 
      of iteration
Watch: revpar_delta_pct median +1% to +5% (ship-able with caveats)
```

### Layer 2: Calibration (is the agent honest about uncertainty)

```
predicted_p_book_calibration:
  Bin candidate prices into deciles by predicted P(book).
  For each decile, compute realized P(book) on backtest.
  calibration_error = mean abs(predicted - realized) across deciles.

confidence_calibration:
  When PriceGuard says confidence = 0.8, what fraction of those 
  decisions had outcome that matched the proposal within 5%?

Ship: calibration_error < 10pp across all deciles
      confidence calibration within ±5pp of stated confidence
Fail: calibration_error > 20pp anywhere
Watch: calibration_error 10-20pp (model needs more data)
```

### Layer 3: Operational (will the human RM trust this)

```
hard_block_rate          % of decisions hitting hard_block
flag_review_rate         % hitting flag_review
override_rate_60d        % human modifies in first 60 days live
exploration_efficiency   info_gain per AED of exploration spend
elasticity_drift         posterior change week-over-week (instability)

Ship: hard_block_rate < 2%
      override_rate_60d < 15%
      elasticity_drift stable (within ±10% week-over-week)
Fail: hard_block_rate > 8% (RM drowns)
      override_rate_60d > 25% (RM doesn't trust)
Watch: hard_block_rate 2-8%, override_rate_60d 15-25%
```

---

## Harness implementation

```python
# nightly_eval.py
# Run via Celery beat at 02:00 UTC

def nightly_evaluation():
    run_id = uuid4()
    started_at = datetime.utcnow()

    # 1. Capture current config
    prompts_hash = compute_prompts_hash()
    constants_hash = compute_constants_hash()

    # 2. Walk backtest decision points
    decision_points = generate_backtest_decision_points(
        properties=all_active_properties(),
        window=("2024-05-07", today() - timedelta(days=14)),
        lead_times=[30, 14, 7, 3]
    )

    # 3. Replay each
    layer_1_data = []
    layer_2_data = []
    for dp in decision_points:
        try:
            replay_result = call_audit_replay(
                decision_id=dp.original_decision_id,
                overrides={
                    "agent_version": current_priceguard_version,
                    "model": current_priceguard_model
                },
                mode="backtest"
            )
            layer_1_data.append(extract_revpar_diff(replay_result))
            layer_2_data.append(extract_calibration_data(replay_result))
        except Exception as e:
            log_error(dp, e)

    # 4. Aggregate per cluster
    layer_1 = aggregate_revpar_per_cluster(layer_1_data)
    layer_2 = compute_calibration_metrics(layer_2_data)
    layer_3 = compute_operational_metrics(window_days=30)

    # 5. Determine ship status
    ship_status = compute_ship_status(layer_1, layer_2, layer_3)

    # 6. Compare to last night's run
    last_run = get_latest_evaluation_run()
    regressions = detect_regressions(last_run, layer_1, layer_2, layer_3)
    improvements = detect_improvements(last_run, layer_1, layer_2, layer_3)

    # 7. Persist
    db.execute("""
      INSERT INTO evaluation_runs (run_id, run_at, prompts_hash, 
        constants_hash, layer_1_metrics, layer_2_metrics, layer_3_metrics,
        ship_status, regressions, improvements)
      VALUES (...)
    """, run_id, started_at, prompts_hash, constants_hash, layer_1, 
        layer_2, layer_3, ship_status, regressions, improvements)

    # 8. Alert on regressions
    if any(r.severity == "high" for r in regressions):
        slack_alert(regressions)

    # 9. Post scorecard to dashboard
    post_scorecard_to_dashboard(run_id)
```

### Decision point generation

```python
def generate_backtest_decision_points(properties, window, lead_times):
    points = []
    for prop in properties:
        nights = generate_nights(window.start, window.end)
        for night in nights:
            for lt in lead_times:
                decision_ts = night - timedelta(days=lt)
                if decision_ts < window.start:
                    continue
                # Find or synthesize the original decision
                original = find_or_synthesize_decision(prop, night, decision_ts)
                points.append(BacktestPoint(
                    property_id=prop.id,
                    target_date=night,
                    decision_ts=decision_ts,
                    lead_time=lt,
                    original_decision_id=original.id
                ))
    return points
```

For nights before week-1 instrumentation, synthesize a "decision" from the actually-priced state. The replay still works because it reconstructs state from `state_snapshots` (or, for pre-instrumentation history, from PMS reservation records and contemporaneous comp scrapes).

### Counterfactual scoring

```python
def score_replay(original_outcome, replayed_decision):
    # Original: what actually happened (booked or not, at original price)
    # Replayed: what new price the new agent would have chosen
    
    if original_outcome.outcome_type == "booked":
        # Did the night book? At what price was the booking?
        actual_price = original_outcome.realized_price
        new_price = replayed_decision.chosen_price
        
        if new_price <= actual_price:
            # New price would have also booked, but at lower price = revenue loss
            revenue_delta = new_price - actual_price
        else:
            # New price is higher; need to predict if it would have booked
            features = reconstruct_features(...)
            p_book = call_elasticity_predict(features, [new_price])
            expected_revenue = new_price * p_book
            revenue_delta = expected_revenue - actual_price
    
    elif original_outcome.outcome_type == "unbooked":
        # Original price did not book
        # Would new price have booked? Use elasticity to predict
        features = reconstruct_features(...)
        p_book = call_elasticity_predict(features, [replayed_decision.chosen_price])
        expected_revenue = replayed_decision.chosen_price * p_book
        revenue_delta = expected_revenue - 0  # original earned 0
    
    return {
        "revenue_delta_aed": revenue_delta,
        "predicted_p_book": p_book,
        "actual_outcome": original_outcome.outcome_type,
        "calibration_observation": ...
    }
```

The elasticity model is used as the simulator for the counterfactual. This is consistent with how PriceLabs and Wheelhouse self-validate.

---

## Promotion policy (cluster-by-cluster)

```
Promotion rules:

Cluster passes layer 1 + layer 2 ship thresholds for 7 consecutive 
nightly runs → promote that cluster to live mode (PriceGuard pushes
to PMS).

Cluster fails any layer threshold → demote to dry-run mode 
(decisions logged, not pushed; RM dashboard surfaces all).

Promotion granularity is cluster_id + property_id pair. Individual
properties in a passing cluster can still be held back if their own
property-level scorecard is bad.

Promotion state lives in property_promotion_status table:

CREATE TABLE property_promotion_status (
  property_id    UUID PRIMARY KEY,
  status         TEXT NOT NULL,  -- 'dry_run' | 'live' | 'paused'
  cluster_id     TEXT NOT NULL,
  promoted_at    TIMESTAMPTZ,
  consecutive_passing_runs INT DEFAULT 0,
  last_run_id    UUID,
  reason         TEXT
);
```

PriceGuard reads `status` before every push. Dry-run mode logs the decision and posts to RM dashboard but does not push to PMS.

---

## Scorecard format (sample output)

```
Run: 2026-05-07T02:00:00Z
prompts_hash: a3f9...
constants_hash: 7c2e...

LAYER 1: REVPAR DELTA PER CLUSTER
─────────────────────────────────────────────────────
                                 Median   P25    P75
dxb_marina_1br_premium           +6.4%   +1.2%  +11.8%   READY
dxb_marina_1br_standard          +5.1%   +0.3%   +9.4%   READY
dxb_marina_2br                   +3.7%   -0.8%   +7.2%   WATCH
dxb_downtown_1br_premium         +7.1%   +2.4%  +13.0%   READY
dxb_palm_2_3br_premium           +4.2%   -1.1%   +9.8%   WATCH
dxb_other                        +2.8%   -2.4%   +6.7%   WATCH

LAYER 2: CALIBRATION
─────────────────────────────────────────────────────
calibration_error            7.2%       READY (<10%)
confidence_calibration       3.1%       READY (within ±5pp)

LAYER 3: OPERATIONAL
─────────────────────────────────────────────────────
hard_block_rate              1.4%       READY
flag_review_rate             8.2%       OK
override_rate_60d            12.4%      READY
elasticity_drift             ±6%        READY

OVERALL SHIP STATUS: WATCH
Reason: dxb_marina_2br, dxb_palm_2_3br_premium, dxb_other 
        below +5% median threshold. Hold those clusters in dry-run.
        Promote dxb_marina_1br_premium, dxb_marina_1br_standard,
        dxb_downtown_1br_premium to live (consecutive passing runs: 8).

REGRESSIONS vs last run:
  None.

IMPROVEMENTS vs last run:
  dxb_marina_1br_premium median +6.4% (was +4.9%, +1.5pp)
  calibration_error 7.2% (was 9.1%, -1.9pp)
```

---

## Ship-readiness in dirhams

```
For your 30 UAE units, ship-readiness means:

Cluster                          Avg gross/mo    Expected uplift
─────────────────────────────────────────────────────────────────
dxb_marina_1br_premium  (~7)     AED 30k         +6% = +AED 1,800/mo
dxb_marina_1br_standard (~6)     AED 18k         +5% = +AED 900/mo
dxb_marina_2br          (~5)     AED 35k         +5% = +AED 1,750/mo
dxb_downtown_1br_premium(~5)     AED 24k         +6% = +AED 1,440/mo
dxb_palm_2_3br_premium  (~3)     AED 60k         +6% = +AED 3,600/mo
dxb_other               (~4)     AED 18k         +4% = +AED 720/mo

Total monthly recoverable: ~AED 35,000-45,000/mo across 30 properties
Annualized: ~AED 420k-540k

At 12% performance fee (Tier 3 SKU): AED 50k-65k/year on this portfolio
At Tier 2 flat AED 200/unit/month: AED 72k/year

This is the number that goes on the diagnosis report cover page.
```

---

## Diagnostic outputs

The harness produces three things every night:

1. `evaluation_runs` row with full scorecard (DB)
2. Per-cluster trend chart (image, posted to dashboard)
3. Slack alert if any regression > 2% RevPAR on any cluster

Engineers reading the scorecard can ask:
- Which properties drove the cluster median?
- Which decisions had highest revenue_delta? Which had lowest?
- Are calibration errors clustered around a specific lead_time?
- Is exploration losing money or paying for itself?

The harness exposes a `/backtest/inspect/<run_id>` endpoint that surfaces these breakdowns.

---

## Adversarial test scenarios

In addition to the historical backtest, run synthetic shock tests against the regime classifier and elasticity model:

```
Synthetic test 1: war shock
  Inject regime_score = 0.85 for 14 days, then back to 0.4.
  Verify: agent reduces prices proportionally, recovers as score 
  recovers. No cliff transitions.

Synthetic test 2: NYE event
  Inject confirmed mega-event with confidence 1.0, premium band 
  [2.0, 3.5x], for Dec 30-Jan 2 in Marina cluster.
  Verify: agent reaches 3-4x base on Marina premium properties.
  Verify: no hard_block on the legitimate spike.

Synthetic test 3: source market shock
  Set russia_modifier = 0.4, all others stable.
  Verify: properties heavy on Russian guests get larger downward 
  pressure. Properties light on Russian get small effect.

Synthetic test 4: comp set drift
  Move comp set median up 25% over 3 days.
  Verify: agent doesn't herd; agent dampens comp drift signal.
  Verify: price moves are within max_daily_pct_move.
```

These run weekly and produce pass/fail with detailed diagnostics.

---

## Time and resource cost

```
Backtest run: ~2 hours for 24 months × 30 properties on a 
4-vCPU 16GB instance. Parallelizable: 30 minutes on 16 vCPU.

LLM cost per nightly run: ~$15 at current model assignments. 
Use Anthropic Batches API for 50% discount on this batch workload.

Storage growth: ~50MB per nightly run for the evaluation row 
+ inspection data. Negligible.

Compute cost: ~$30/month for the harness instance. Negligible.

Cost in engineer time: 0 hours/week after week 2 build, except 
when interpreting regressions (2-4 hours/week).
```

---

## Failure modes and recovery

```
Harness can't find original decisions for a window:
  Use synthesized decision points from PMS reservation records.
  Mark scorecard with "synthesized" flag for that window.

Elasticity model unavailable:
  Fail fast, retry next night. Do not silently fall back to 
  comp-median proximity heuristic in production.

Backtest takes >6 hours:
  Sample decision points (every 3rd lead time, every 5th night).
  Mark scorecard "sampled" with sample rate.
  Schedule full run on weekends.

Calibration data sparse for a cluster:
  Less than 100 observations: skip layer 2 for that cluster, 
  flag in scorecard.
```
