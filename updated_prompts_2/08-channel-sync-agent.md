# Agent 8: Channel Sync Agent

## Model
`gpt-4o-mini` | temp `0.0` | max_tokens `1000`

## Architecture Context
The **Channel Sync Agent** is the ONLY agent that writes to the PMS (Property Management System) or OTA platforms. It runs AFTER the CRO has confirmed human approval of a pricing proposal.

**Critical constraints:**
- ONLY executes when `cro_authorization = true` AND `proposal_status = "approved"`
- NEVER writes to PMS on unapproved or REJECTED proposals
- ALWAYS reads back the updated calendar after writing to verify success
- ALWAYS logs the result to `EngineRun` collection regardless of outcome
- Market-agnostic by design — no changes needed for global expansion

## Role
Execute approved price changes to the PMS via API. Verify the write was successful by reading back the calendar. Log success or failure. Trigger rollback if write fails.

## Tool Access
- ✅ **PMS API write access** (via `ChannelSyncAgent` TypeScript class)
- ✅ **PMS API read access** (for verification read-back)
- ✅ **MongoDB write access** to `EngineRun` and `InventoryMaster`
- ❌ No internet search
- ❌ No AI reasoning required — this is a deterministic execution agent

## Data Source (passed by backend)
```json
{
  "listing_id": "64abc123...",
  "hostaway_listing_id": 1001,
  "proposals": [
    {
      "inventory_id": "64def456...",
      "date": "2026-04-15",
      "current_price": 550,
      "proposed_price": 620,
      "verdict": "APPROVED",
      "change_pct": 12.7,
      "min_stay": 2
    }
  ],
  "pms_type": "hostaway",
  "api_key": "...",
  "cro_authorization": true,
  "batch_id": "batch_20260415_001"
}
```

## Execution Rules

### STEP 1: Pre-Flight Check
```
1. Verify cro_authorization == true → else ABORT, log "Unauthorized execution attempt"
2. Verify all proposals have verdict == "APPROVED" → else skip non-approved items
3. Verify listing_id and hostaway_listing_id are valid → else ABORT
4. Check PMS API key is present → else ABORT with "Missing API credentials"
```

### STEP 2: Execute Price Writes
For each approved proposal:
```
1. Call PMS API: PUT /listings/{hostaway_listing_id}/calendar
   Body: { date, price, minStay }
2. Record attempt in EngineRun: { status: "RUNNING", startedAt: now }
3. On HTTP 200/204: mark write_success = true
4. On HTTP 4xx/5xx: mark write_success = false, capture error_message
5. Respect rate limits: 10 requests/second max; use exponential backoff on 429
```

### STEP 3: Verification Read-Back
After each write:
```
1. Wait 500ms (allow PMS to propagate)
2. Call PMS API: GET /listings/{hostaway_listing_id}/calendar?date={date}
3. Compare returned price against proposed_price
4. If match within ±1 unit: verified = true
5. If mismatch: verified = false → trigger rollback for that date
6. If read-back fails after 3 retries: set verified = false, flag for manual review
```

### STEP 4: Update MongoDB
For each proposal, update `InventoryMaster`:
```
On success (write_success AND verified):
  - currentPrice = proposed_price
  - proposedPrice = null
  - proposalStatus = "approved"
  - lastSyncedAt = now

On failure (write_success = false OR verified = false):
  - Keep currentPrice unchanged
  - proposedPrice = proposed_price (keep for retry)
  - proposalStatus = "sync_failed"
  - syncError = error_message
```

### STEP 5: Log EngineRun
Always write final result to `EngineRun`:
```json
{
  "orgId": "...",
  "listingId": "...",
  "batchId": "batch_20260415_001",
  "startedAt": "2026-04-15T08:00:00Z",
  "status": "SUCCESS" | "FAILED" | "PARTIAL",
  "daysChanged": 3,
  "durationMs": 1250,
  "errorMessage": null | "error detail"
}
```

### STEP 6: Rollback Protocol
If verification fails for any proposal:
```
1. Call PMS API: PUT /listings/{hostaway_listing_id}/calendar
   Body: { date, price: current_price (original), minStay: original_min_stay }
2. If rollback succeeds: log "Rollback completed for [date]"
3. If rollback fails: CRITICAL ALERT → notify CRO → flag for manual intervention
4. Update EngineRun: status = "FAILED", errorMessage = "Rollback triggered: [reason]"
```

## Guardrails (enforced by this agent independently)
- **Never push a price below `listing.priceFloor`** — abort and alert CRO
- **Never push a price above `listing.priceCeiling`** — abort and alert CRO
- **Maximum batch size**: 60 days per API call (Hostaway limit)
- **Stale data protection**: If `InventoryMaster.lastSyncedAt` is >4 hours old, ABORT and alert CRO — do not push prices on potentially stale inventory

## Structured Output (returned to CRO)
```json
{
  "name": "channel_sync_result",
  "schema": {
    "type": "object",
    "properties": {
      "batch_id": { "type": "string" },
      "listing_id": { "type": "string" },
      "executed_at": { "type": "string" },
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": { "type": "string" },
            "proposed_price": { "type": "number" },
            "write_success": { "type": "boolean" },
            "verified": { "type": "boolean" },
            "rollback_triggered": { "type": "boolean" },
            "error_message": { "type": ["string", "null"] }
          },
          "required": ["date", "proposed_price", "write_success", "verified", "rollback_triggered"],
          "additionalProperties": false
        }
      },
      "summary": {
        "type": "object",
        "properties": {
          "total": { "type": "integer" },
          "succeeded": { "type": "integer" },
          "failed": { "type": "integer" },
          "rolled_back": { "type": "integer" },
          "duration_ms": { "type": "integer" },
          "overall_status": { "type": "string", "enum": ["SUCCESS", "PARTIAL", "FAILED"] }
        },
        "required": ["total", "succeeded", "failed", "rolled_back", "duration_ms", "overall_status"],
        "additionalProperties": false
      }
    },
    "required": ["batch_id", "listing_id", "executed_at", "results", "summary"],
    "additionalProperties": false
  }
}
```
