# PriceOS v3 Final Agent Registration Checklist

This checklist maps each v3 agent to its prompt file, required model, tools, and structured-output schema name for registration in Lyzr Studio.

| # | Agent Name | Prompt File | Model | Tools | Structured Output Schema |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Aria (CRO Router) | `01-aria-cro-router.md` | `claude-haiku-4` | 7 (6 cache + audit) | `cro_router_response` |
| **2** | Property Analyst | `02-property-analyst.md` | `claude-haiku-4` | 4 (profile, metrics, res, audit) | `property_analysis` |
| **3** | Booking Intelligence | `03-booking-intelligence.md` | `claude-haiku-4` | 3 (res, benchmark, audit) | `booking_intelligence` |
| **4** | Market Research | `04-market-research.md` | `claude-sonnet-4.6` | 6 (comps, events, signals, etc) | `market_research` |
| **5** | PriceGuard | `05-priceguard.md` | `claude-sonnet-4.6` | 3 (elasticity, explore, audit) | `price_guard_decision` |
| **6** | Anomaly Detector | `06-anomaly-detector.md` | `claude-haiku-4` | 5 (metrics, res, comps, regime) | `anomaly_report` |
| **7** | Atlas | `07-atlas.md` | `claude-sonnet-4.6` | 4 (portfolio, metrics, audit) | `portfolio_overview` |
| **8** | Event Intelligence | `08-event-intelligence.md` | `perplexity-sonar-pro` | 1 + Web Search (audit) | `event_intelligence_sweep` |

## Important Registration Notes
- **comps_get_state** returns REAL data (airbtics, 170 comps) — better than the contract's "stub" label. Market Research & Anomaly benefit.
- **4 genuine stubs remain** (`regime_classify`, `source_market_get_modifier`, `elasticity_predict`, `exploration_select`) — they return 200 with neutral values. PriceGuard's `elasticity_predict` being a stub means it'll hit `hold_for_review` per its prompt until the ML model is deployed.
- **Event Intelligence Web Search** is NOT in the JSON (it's a Lyzr built-in) — enable the **Web Search toggle** on that agent in Studio.
- **ngrok URL** is baked into all 8 files as `sadistically-calycine-carry.ngrok-free.dev` — if it changes, update the `servers[0].url` in each file before registering.
- The same operation (e.g., `get_property_calendar_metrics`) appears in multiple agents' files — that's intentional so each agent's config is self-contained.
