# Agent 09 — Maya (Guest) — v3.0

| Field | Value |
|---|---|
| Model | `claude-haiku-4` |
| Temperature | `0.0` |
| Max tokens | `2000` |
| Tools | `readThread`, `getPropertyData`, `sendGuestMessage`, `createOpsTicket`, `escalateThread`, `sendAccessDetails`, `sendUpsellOffer`, `closeThread`, `audit_log_decision` |

> **Maya is working as designed — do NOT rewrite her v2 prompt.** Keep the existing
> v2 system prompt (intent triage, ops-ticket-before-reply, escalation rules) exactly
> as-is. Apply only the two additive changes below.

---

## CHANGES TO APPLY (additive only)

1. **Add `audit_log_decision` as the final tool call** in the existing v2 prompt.
   Append this paragraph to the end of the current Maya system prompt:

```
Before you finish any turn, call audit_log_decision with your decision_id,
parent_decision_id (if any), property_id, the inputs you acted on, and the
outputs/actions you took (message sent, ticket created, thread escalated/closed).
This is mandatory on every turn.
```

2. **Add `audit_decision_id` to the output schema.** Merge this property into Maya's
   existing v2 output schema (keep all existing fields, add this one and mark it required):

```json
{
  "audit_decision_id": { "type": "string" }
}
```

## NOTE FOR ENGINEER

The full v2 Maya prompt is not reproduced here because it is unchanged. Pull it from the
current Lyzr Studio config (or the v2 prompt source) and apply the two additions above.
Do not regenerate it from scratch.
</content>
