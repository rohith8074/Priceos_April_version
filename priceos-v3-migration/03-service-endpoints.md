# Python Service Endpoints

## What changed

A new Python service exposes 13 endpoints. Lyzr agents call these as tools. The service owns state, learning, determinism, and replay. The Python service is the brain. Lyzr is the mouth.

## Why

Resolves shortcomings:
- 1 (Aria bottleneck): per-agent tools live here, not all funneled through Aria
- 2 (stateless sub-agents): memory and posteriors live here
- 3 (no structured arbitration): /pricing/compose is deterministic
- 6 (Maya siloed from pricing): /guest_signals/get_summary bridges them
- 8, 9 (no elasticity, no exploration): /elasticity and /exploration endpoints
- 10, 11, 13 (regime issues): /regime/classify
- 12 (no source-market segmentation): /source_market/get_modifier
- 14 (no audit-replay): /audit endpoints

## Impact on product

- Sub-agents become independent (one failure no longer cascades)
- All learning happens here, versioned, testable, replayable
- Customer-facing diagnosis report and RM dashboard are powered by these endpoints

---

## Endpoint registry

| Endpoint | Purpose | Called by | Latency target |
|---|---|---|---|
| `POST /audit/log_decision` | Persist agent decision | All agents (final tool call) | <100ms p99 |
| `POST /audit/replay` | Re-invoke decision with overrides | Backtest harness, ops | <5s |
| `POST /elasticity/predict` | P(book) for candidate prices | PriceGuard | <500ms p99 |
| `POST /elasticity/update` | Online Bayesian update | Nightly batch | <60s |
| `POST /exploration/select` | Bandit arm selection | PriceGuard | <100ms p99 |
| `GET /regime/classify` | Daily regime score per city | Market Research | <100ms (cached) |
| `POST /source_market/get_modifier` | Property-specific demand modifier | Market Research, PriceGuard | <200ms |
| `POST /comps/get_state` | Live comp set state for property | Market Research, Property Analyst | <300ms |
| `POST /events/get_validated` | Verified events with confidence | Market Research, Aria | <100ms |
| `POST /guest_signals/get_summary` | Trailing guest sentiment | Market Research | <200ms |
| `GET /rm/queue` | RM dashboard queue | Frontend | <500ms |
| `POST /rm/action` | RM action audit | Frontend | <200ms |
| `POST /backtest/run` | Run agent against history | Internal tooling | async, hours |

## /elasticity/predict

```
POST /elasticity/predict

Request:
{
  "property_id":      "<uuid>",
  "target_date":      "2026-12-31",
  "candidate_prices": [800, 1000, 1200, 1500, 1800, 2200, 2700],
  "features": {
    "lead_time_days":             45,
    "day_of_week":                3,           # 0=Mon, 6=Sun
    "month":                      12,
    "comp_set_median":            1450,
    "comp_set_occupancy_pct":     0.78,
    "pace_index":                 1.12,
    "regime_score":               0.32,
    "source_market_modifier":     0.94,
    "event_premium_strength":     0.85,
    "listing_quality_score":      0.91,
    "min_stay":                   3
  }
}

Response:
{
  "predictions": [
    {"price": 800,  "p_book": 0.94, "expected_revpar": 752, "ci_95": [0.91, 0.96]},
    {"price": 1000, "p_book": 0.87, "expected_revpar": 870, "ci_95": [0.82, 0.91]},
    {"price": 1200, "p_book": 0.74, "expected_revpar": 888, "ci_95": [0.66, 0.80]},
    {"price": 1500, "p_book": 0.51, "expected_revpar": 765, "ci_95": [0.43, 0.59]},
    {"price": 1800, "p_book": 0.32, "expected_revpar": 576, "ci_95": [0.25, 0.39]},
    {"price": 2200, "p_book": 0.18, "expected_revpar": 396, "ci_95": [0.13, 0.24]},
    {"price": 2700, "p_book": 0.08, "expected_revpar": 216, "ci_95": [0.05, 0.13]}
  ],
  "model_version":   "elasticity_v0_3",
  "posterior_age":   "<24h",
  "sample_size":     127
}
```

## /elasticity/update

Nightly batch endpoint. Reads recent outcomes, updates posteriors. Internal.

```
POST /elasticity/update

Request:
{
  "since": "2026-05-06T00:00:00Z",
  "scope": "all" | "property:<uuid>" | "cluster:<id>"
}

Response:
{
  "properties_updated":  127,
  "observations_consumed": 432,
  "posteriors_drift":    {
    "median_kl_divergence": 0.018,
    "max_kl_divergence":    0.142
  },
  "duration_ms":         48230
}
```

## /exploration/select

```
POST /exploration/select

Request:
{
  "property_id":    "<uuid>",
  "target_date":    "2026-09-15",
  "exploit_choice": {
    "price":            1200,
    "expected_revpar":  888
  },
  "exploration_budget_remaining": 0.08,    # fraction of unbooked nights
  "lead_time_days": 45
}

Response:
{
  "chosen_price":      1350,
  "is_exploration":    true,
  "rationale":         "Thompson-sampled from posterior, ε budget=0.08, lead_time qualifies",
  "expected_information_gain": 0.12,
  "exploit_alternative": {"price": 1200, "expected_revpar": 888}
}
```

Rules:
- Exploration only on unbooked nights with lead_time > 14 days
- Capped at 5-10% of unbooked-night-inventory per property per month
- Never on guardrail-blocked candidates

## /regime/classify

```
GET /regime/classify?city=dubai&date=2026-05-07

Response:
{
  "city":         "dubai",
  "as_of":        "2026-05-07T18:00:00Z",
  "regime_score": 0.42,
  "regime_label": "watch",
  "trend":        "stable",
  "confidence":   0.78,
  "per_source_market": {
    "russia":  {"modifier": 0.92, "label": "soft"},
    "india":   {"modifier": 1.05, "label": "stable"},
    "uk":      {"modifier": 0.81, "label": "watch"},
    "germany": {"modifier": 0.78, "label": "watch"},
    "ksa":     {"modifier": 1.10, "label": "strong"},
    "us":      {"modifier": 0.85, "label": "watch"},
    "china":   {"modifier": 0.93, "label": "stable"},
    "other":   {"modifier": 0.95, "label": "stable"}
  },
  "feature_contributions": [
    {"feature": "uk_advisory_level", "z": 1.8, "contribution": 0.12},
    {"feature": "news_sentiment_7d", "z": -1.4, "contribution": 0.09},
    {"feature": "first_party_pace_delta", "z": -1.1, "contribution": 0.08},
    {"feature": "iata_capacity_wow", "z": -0.6, "contribution": 0.05}
  ],
  "data_freshness": {
    "news":          "2m",
    "iata":          "1d",
    "det":           "12d",
    "first_party":   "1h"
  }
}
```

Cached for 1 hour per city. Computed daily by background job at 06:00 UTC.

## /source_market/get_modifier

```
POST /source_market/get_modifier

Request:
{
  "property_id":  "<uuid>",
  "target_date":  "2026-09-15"
}

Response:
{
  "modifier": 0.87,
  "breakdown": [
    {"country": "russia", "share": 0.22, "regime_modifier": 0.62,
     "adjusted": 0.58, "contribution": 0.128},
    {"country": "india",  "share": 0.18, "regime_modifier": 1.04,
     "adjusted": 1.06, "contribution": 0.191},
    {"country": "uk",     "share": 0.14, "regime_modifier": 0.81,
     "adjusted": 0.77, "contribution": 0.108}
  ],
  "notes": "Russian softness offset by Indian and KSA strength",
  "cluster_id":      "dxb_marina_1br_premium",
  "mix_window_days": 90
}
```

## /comps/get_state

```
POST /comps/get_state

Request:
{
  "property_id":  "<uuid>",
  "target_window": {"start": "2026-05-07", "end": "2027-05-07"}
}

Response:
{
  "comp_set_size":  15,
  "by_target_date": [
    {"date": "2026-05-07", "median": 1240, "p25": 980, "p75": 1500,
     "occupancy_pct": 0.62, "comps_observed": 14},
    {"date": "2026-05-08", "median": 1280, "p25": 1010, "p75": 1560,
     "occupancy_pct": 0.71, "comps_observed": 15}
  ],
  "wow_change_pct": -0.08,
  "movers": [
    "Marina Pearl 12F dropped 12% on 2026-05-04",
    "Address Residences 2BR raised 8% on 2026-05-05",
    "Marina Heights 9F dropped 6% on 2026-05-06"
  ]
}
```

## /events/get_validated

```
POST /events/get_validated

Request:
{
  "city":           "dubai",
  "target_window":  {"start": "2026-05-07", "end": "2026-12-31"},
  "min_confidence": 0.6
}

Response:
{
  "events": [
    {
      "event_id":       "<uuid>",
      "name":           "GITEX Global 2026",
      "start_date":     "2026-10-13",
      "end_date":       "2026-10-17",
      "category":       "major",
      "expected_premium_low":  0.40,
      "expected_premium_high": 0.60,
      "applicable_areas": ["trade_centre", "sheikh_zayed_road"],
      "confidence":     0.95,
      "verification_status": "human_approved",
      "source_urls":    ["https://gitex.com/...", "https://dwtc.com/..."]
    }
  ]
}
```

Events are surfaced only at confidence >= min_confidence. Human-approved events get 1.0 confidence. Auto-verified events range 0.6 to 0.85.

## /guest_signals/get_summary

```
POST /guest_signals/get_summary

Request:
{
  "property_id":  "<uuid>",
  "window_days":  30
}

Response:
{
  "sentiment_score":    0.42,                    # -1 to 1
  "thread_count":       18,
  "complaint_categories": {
    "cleanliness":      0.06,
    "noise":            0.11,
    "amenity_fault":    0.04,
    "wifi":             0.02
  },
  "positive_themes":    ["view", "location", "checkin_smooth"],
  "recurring_themes":   ["noise from adjacent bar after 23:00"],
  "trend":              "stable"
}
```

PriceGuard reads this as the `listing_quality_signal` in elasticity features. A property with consistent noise complaints sees its quality score reduced, optimal price shifts down.

## /rm/queue

```
GET /rm/queue?rm_id=<uuid>&filters={...}

Response:
{
  "active": [...],          # hard_block + flag_review + critical anomalies
  "watch":  [...],          # confidence drops, source-market shifts, drift
  "routine_summary": {
    "count":          47,
    "total_revenue":  62000,
    "properties":     ["Marina Heights 1BR", "Downtown Burj 1BR", ...]
  },
  "sidebar": {
    "owner_messages":           [...],
    "expiring_strategy_memos":  [...],
    "comp_drift_alerts":        [...]
  }
}
```

Active items sorted by `revenue_impact_aed` descending. Each item has the row template, the agent's proposal, the runner-up, the available actions, and links to audit trail.

## /rm/action

```
POST /rm/action

Request:
{
  "rm_id":         "<uuid>",
  "decision_id":   "<uuid>",
  "action":        "approve" | "modify" | "reject" | "override" | "escalate_to_owner",
  "modified_price": 1380,
  "modified_min_stay": 2,
  "rationale":     "Owner asked for tighter weekend pricing on this property"
}

Response:
{
  "action_id":     "<uuid>",
  "outcome":       "applied",
  "pms_push_status": "queued"   # via channel sync agent
}
```

Every action writes a row to `rm_actions` and triggers PMS push if the verdict was modify or override.

## /backtest/run

```
POST /backtest/run

Request:
{
  "scope":          "all" | "property:<uuid>" | "cluster:<id>",
  "window":         {"start": "2024-05-07", "end": "2026-05-07"},
  "config_overrides": {
    "agent_versions": {"priceguard": "v3.1", "market_research": "v3.0"},
    "models":         {"priceguard": "claude-sonnet-4.7"},
    "constants":      {"event_premium_cap": 3.0}
  }
}

Response (async, polling pattern):
{
  "run_id":     "<uuid>",
  "status":     "queued",
  "eta_minutes": 92
}

GET /backtest/run/<run_id>
{
  "run_id":     "<uuid>",
  "status":     "complete",
  "evaluation_run_id": "<uuid>",
  "scorecard": {
    "layer_1": {"per_cluster": [...]},
    "layer_2": {"calibration_error": 0.07},
    "layer_3": {"hard_block_rate": 0.014}
  },
  "ship_status": "READY"
}
```

## OpenAPI contract

Full machine-readable contract in `/schemas/openapi-contract.yaml`. Lyzr's tool definitions reference this URL.

## Service tech stack

- **Framework**: FastAPI
- **DB**: Postgres 15 + TimescaleDB extension
- **Queue**: Celery on Redis
- **Cache**: Redis (separate logical DB) for regime cache, comp state cache
- **Models in production**: PyMC for elasticity, LightGBM for regime classifier, exported to ONNX or pickled and loaded once at boot
- **Auth**: API key per Lyzr environment, rotated quarterly
- **Rate limits**: per-endpoint, per-org, generous defaults (Lyzr is the only caller for most)

## Deployment

- Containerized (Docker)
- Hosted on Railway, Fly, or AWS Fargate
- Autoscale on CPU and queue depth
- Postgres on Neon or Supabase (managed)
- Redis on Upstash or self-hosted

## Testing

- Unit tests on every endpoint (FastAPI TestClient)
- Integration tests covering Lyzr → service → DB round-trip
- Replay-determinism test: replay same decision twice, outputs must match (assuming same model+temp)
- Backtest regression test in CI (small fixture, 1 property, 30 days)
