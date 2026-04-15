# Split Lyzr Tool Configs (3-Config Setup)

Use these three OpenAPI files as three separate **Custom OpenAPI Tools** in Lyzr.
All three configs are **read-only** (no write operations exposed).

## Files

- `openapi-agent-tools-dashboard-v1.json`
- `openapi-agent-tools-property-v1.json`
- `openapi-agent-tools-guest-v1.json`

## Tool Names in Lyzr

- `priceos_dashboard_tools_v1`
- `priceos_property_tools_v1`
- `priceos_guest_tools_v1`

## Agent Mapping

- Dashboard / CRO (portfolio queries):
  - `priceos_dashboard_tools_v1`
- Agent Chat (property-level pricing chat):
  - `priceos_property_tools_v1`
- Guest Inbox:
  - `priceos_guest_tools_v1`
  - Read-only operations:
    - `list_guest_conversations`
    - `get_guest_summary`

## Import Steps

1. Open Lyzr Studio -> Tools -> Add Tool.
2. Select **Custom OpenAPI Tool**.
3. Upload one of the three files above.
4. Repeat for all three.
5. Attach each tool only to the intended agent.

## Base URL Note

Each spec uses:

`https://YOUR_DOMAIN/api/agent-tools/v1`

Replace `YOUR_DOMAIN` with your deployed domain before import (or edit server URL in Lyzr if supported).
