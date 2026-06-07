# PriceOS v3 — Lyzr Agent Configs (paste-ready)

This folder is the **apply-in-Lyzr-Studio** package for the v3 agent rewrites described
in `../04-lyzr-agent-changes.md`. Each agent has one self-contained prompt file with its
model, temperature, max_tokens, tool list, system prompt, and JSON output schema.

```
lyzr-config/
├── README.md                 ← you are here
├── agent-configs.json        ← machine-readable model/temp/tools per agent
└── prompts/
    ├── 01-aria.md
    ├── 02-property-analyst.md
    ├── 03-booking-intelligence.md
    ├── 04-market-research.md
    ├── 05-priceguard.md
    ├── 06-anomaly-detector.md
    ├── 07-atlas.md
    ├── 08-event-intelligence.md
    ├── 09-maya.md
    └── 10-conversation-summary.md
```

## ⚠️ Dependency: build the tools BEFORE pasting the prompts

Most v3 tools are **Python-service endpoints that do not exist yet**. If you paste these
prompts before the endpoints are live, the agents will call tools that return 404.

| Tool | Status | Build in |
|---|---|---|
| `get_property_profile`, `get_property_calendar_metrics`, `get_property_reservations` | **exists (v2 PMS tools)** | — |
| `get_property_benchmark` | exists, rewrap over `comps_get_state` | `03-service-endpoints.md` |
| `audit_log_decision` | **build first** | `02-data-layer.md` |
| `elasticity_predict`, `exploration_select` | build | `03`, `05-models-and-training.md` |
| `regime_classify`, `source_market_get_modifier` | build | `03`, `05` |
| `comps_get_state`, `events_get_validated`, `guest_signals_get_summary` | build | `03-service-endpoints.md` |
| `get_portfolio_overview`, `get_portfolio_revenue_snapshot` | exists/extend | — |

**Order:** data layer (`audit_log_decision`) → service endpoints → then apply these prompts.

## Apply checklist (per agent, in Lyzr Studio)

1. Set **model + temperature** from `agent-configs.json`.
2. Paste the **SYSTEM PROMPT** block from the agent's prompt file.
3. Set the **tool list** (must exactly match `agent-configs.json`).
4. Paste the **OUTPUT SCHEMA** into Lyzr's JSON validator (retry 2, then hard error).
5. Enable **prompt caching**; set **max_tokens** from the config.
6. Confirm `audit_log_decision` is the **final tool** and `audit_decision_id` is in the schema.
7. **Replay 5 known historical inputs** before promoting.

## Aria-specific

- Configure **parallel-execution workflows** for `pricing_decision` and `full_analysis`
  (the `mode: parallel` + `then: [...]` entries in `../schemas/workflow-registry.json`).
- Aria reads the workflow registry as its routing source of truth — it must not invent workflows.

## What changed vs v2 (summary)

- Sub-agents now own their tools (v2: only Aria had tools).
- PriceGuard: multiplier formula + veto **deleted** → optimization over `elasticity_predict`.
- Market Research: `news_factor` **deleted** → reads regime classifier.
- Atlas: `[SYSTEM CONTEXT]` injection **deleted** → calls portfolio tools directly.
- Aria: do-everything orchestrator → **thin router** over the workflow registry.
- All agents: end with `audit_log_decision`, enforce JSON schema, prompt caching, smaller max_tokens.
</content>
