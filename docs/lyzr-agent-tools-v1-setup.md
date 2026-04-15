# Lyzr Tool Configuration: Agent Tools v1

This guide maps the new backend tool endpoints to Lyzr agent configurations.

## 1) Import OpenAPI Tool

1. Open Lyzr Studio -> Tools -> Add Tool.
2. Select **Custom OpenAPI Tool**.
3. Upload `openapi-agent-tools-v1.json`.
4. Set tool collection name: `priceos_agent_tools_v1`.

## 2) Agent Allowlists

Attach only these operations to each agent:

- **Dashboard / CRO (portfolio mode)**
  - `get_portfolio_overview`
  - `get_agent_system_status`
  - `get_portfolio_revenue_snapshot`

- **Property Agent Chat**
  - `get_property_profile`
  - `get_property_calendar_metrics`
  - `get_property_reservations`
  - `get_property_market_events`
  - `get_property_benchmark`

- **Guest Inbox Agent**
  - `list_guest_conversations`
  - `get_guest_summary`
  - `generate_guest_summary`
  - `suggest_and_save_guest_reply`

## 3) Prompt Constraints

Add this policy block to each agent:

- Use only configured tools.
- Never assume missing numbers; call a tool first.
- If data is unavailable, state exactly what is missing.
- Keep answers scoped to current org/property/conversation context.

## 4) Required Test Cases in Lyzr

For each operation, add:

1. Valid input (happy path)
2. Missing required field
3. Invalid date range
4. Cross-org scope (expect unauthorized/not found)
5. Empty result set

## 5) Rollout Sequence

1. Enable on staging first.
2. Validate each UI surface (`Dashboard`, `Agent Chat`, `Guest Inbox`).
3. Monitor logs for tool latency and error rate.
4. Switch production agents to tool-first prompts.
