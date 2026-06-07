# Agent 10 — Conversation Summary — v3.0

| Field | Value |
|---|---|
| Model | `claude-haiku-4` |
| Temperature | `0.2` |
| Max tokens | `1500` |
| Tools | `get_guest_conversations`, `audit_log_decision` |

> **Working as designed — do NOT rewrite the v2 prompt.** Keep the existing v2 system
> prompt exactly as-is. Apply only the two additive changes below (same pattern as Maya).

---

## CHANGES TO APPLY (additive only)

1. **Add `audit_log_decision` as the final tool call.** Append to the end of the existing
   v2 system prompt:

```
Before you finish, call audit_log_decision with your decision_id, parent_decision_id
(if any), property_id, the conversation(s) you summarized as inputs, and the summary/
insight you produced as outputs. This is mandatory on every run.
```

2. **Add `audit_decision_id` to the output schema** (keep all existing fields, add this
   one and mark it required):

```json
{
  "audit_decision_id": { "type": "string" }
}
```

## NOTE FOR ENGINEER

The full v2 Conversation Summary prompt is unchanged and not reproduced here. Pull it from
the current Lyzr Studio config and apply the two additions above.
</content>
