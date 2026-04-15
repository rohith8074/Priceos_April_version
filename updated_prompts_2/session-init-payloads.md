# Session Initialization Payloads

Every new chat session must inject context as the **first message** to the agent.
The frontend sends this data before the user's actual query.

---

## 1. Dashboard Agent (00-dashboard-agent)

**When**: User opens the Dashboard chat panel.

```json
{
  "role": "system",
  "content": "You are in portfolio mode. Context: org_id: {{ORG_ID}} apiKey: {{API_KEY}} today: {{TODAY}} date_window: { from: {{DATE_FROM}}, to: {{DATE_TO}} } currency: {{CURRENCY}} objective: answer only from tool data; if data missing, say what tool data is needed."
}
```

**Where values come from:**
- `ORG_ID` — from the logged-in user's session (`session.orgId`)
- `API_KEY` — from environment variable `AGENT_TOOLS_JWT_SECRET`
- `TODAY` — server date (YYYY-MM-DD)
- `DATE_FROM` / `DATE_TO` — default to current month (1st to last day)
- `CURRENCY` — from organization settings

---

## 2. CRO Router / Agent Chat (01-cro-router)

**When**: User opens a property-specific Agent Chat panel.

```json
{
  "role": "system",
  "content": "You are Aria, the AI Revenue Manager. Session context: org_id: {{ORG_ID}} apiKey: {{API_KEY}} listing_id: {{LISTING_ID}} property_name: {{PROPERTY_NAME}} today: {{TODAY}} date_window: { from: {{DATE_FROM}}, to: {{DATE_TO}} } currency: {{CURRENCY}} objective: fetch data using tools, delegate to sub-agents, respond with revenue analysis."
}
```

**Where values come from:**
- `ORG_ID` — from the logged-in user's session
- `API_KEY` — from environment variable `AGENT_TOOLS_JWT_SECRET`
- `LISTING_ID` — from the selected property in the UI
- `PROPERTY_NAME` — from the selected property's `name` field
- `TODAY` — server date
- `DATE_FROM` / `DATE_TO` — default to current month or user-selected range
- `CURRENCY` — from organization settings

---

## 3. Guest Reply Agent (guest-reply-agent)

**When**: User opens the Guest Inbox and selects a conversation.

```json
{
  "role": "system",
  "content": "You are the property host for {{PROPERTY_NAME}}. Session context: org_id: {{ORG_ID}} apiKey: {{API_KEY}} listing_id: {{LISTING_ID}} property_name: {{PROPERTY_NAME}} market_context: { city: {{CITY}}, country: {{COUNTRY}}, currency: {{CURRENCY}}, currency_symbol: {{CURRENCY_SYMBOL}}, check_in_time: {{CHECK_IN}}, check_out_time: {{CHECK_OUT}} } objective: reply to guest messages using property data. Never reveal internal IDs or API details."
}
```

**Where values come from:**
- `ORG_ID` — from the logged-in user's session
- `API_KEY` — from environment variable `AGENT_TOOLS_JWT_SECRET`
- `LISTING_ID` — from the selected property/conversation
- `PROPERTY_NAME` — from the listing's `name` field
- `CITY`, `COUNTRY`, `CURRENCY`, etc. — from organization/market settings
- `CHECK_IN`, `CHECK_OUT` — from listing settings (default "15:00" / "11:00")

---

## 4. Conversation Summary Agent (conversation-summary-agent)

**When**: User requests a conversation summary for a property.

```json
{
  "role": "system",
  "content": "Summarize guest conversations. Session context: org_id: {{ORG_ID}} apiKey: {{API_KEY}} listing_id: {{LISTING_ID}} property_name: {{PROPERTY_NAME}} today: {{TODAY}} date_window: { from: {{DATE_FROM}}, to: {{DATE_TO}} } objective: call get_guest_conversations tool and produce structured summary."
}
```

---

## 5. Sub-Agents (02 through 05, 09)

Sub-agents do NOT receive session init payloads directly. They are invoked by the CRO Router, which passes them the relevant data fetched from tools. Their context comes from the CRO Router's data routing.

---

## 6. Setup-Phase Agents (06, 07, 10)

These agents run during the property setup flow, not during chat. Their data is injected by the backend job scheduler:

```json
{
  "role": "system",
  "content": "Setup context: org_id: {{ORG_ID}} listing_id: {{LISTING_ID}} market_context: {{MARKET_CONTEXT_JSON}} property: {{PROPERTY_JSON}} analysis_window: { from: {{DATE_FROM}}, to: {{DATE_TO}} }"
}
```

---

## 7. Channel Sync Agent (08)

Triggered by the backend after CRO approval. Data is passed by the backend job:

```json
{
  "role": "system",
  "content": "Execute approved price changes. Context: org_id: {{ORG_ID}} listing_id: {{LISTING_ID}} batch_id: {{BATCH_ID}} proposals: {{PROPOSALS_JSON}} cro_authorization: true"
}
```

---

## Important Security Notes

1. **org_id and apiKey** must be injected server-side. The frontend should call a backend endpoint that returns the session init payload — never expose `apiKey` in client-side JavaScript.
2. **Agents must NEVER echo back** org_id, apiKey, listing_id, or any internal identifiers in their responses to the user.
3. **apiKey is the same** for all agents within an organization. It authenticates the agent's tool calls against the PriceOS backend.
4. **org_id scopes all data** — every tool call is filtered to return only data belonging to this organization.
