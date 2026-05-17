# Human RM Dashboard

## What changed

A new web dashboard is the only operating surface for the human RM. Sorted by revenue impact, one-click actions, batch ops for routine confirmations. Replaces ad-hoc Slack alerts and email-based escalation.

## Why

Resolves shortcomings:
- Operationalizes the RM role at scale (one RM at 150-200 properties instead of 30-60)
- Captures every RM action as labeled training data (RM corrections feed elasticity model)
- Surfaces escalations from PriceGuard's new verdict spectrum (hard_block, flag_review, hold_for_review)

## Impact on product

- One RM can manage 150-200 properties cost-effectively
- Every RM action is logged and feeds back into model training (compounding intelligence)
- Owners get fast resolution on escalations because RM has revenue-impact-sorted queue
- Tier 3 service ("PriceOS + Managed RM" at AED 400-600/unit/month) becomes deliverable

---

## Layout (single page, three zones + sidebar)

```
┌─────────────────────────────────────────────────────────────┐
│  TOP ZONE: ACTIVE ESCALATIONS                                │
│  Sorted by revenue_impact_aed DESC                          │
│  Shows: hard_block + flag_review + critical anomalies        │
│  Visual: color-coded severity, prominent action buttons     │
├─────────────────────────────────────────────────────────────┤
│  MIDDLE ZONE: WATCH ITEMS                                    │
│  Sorted by recency                                          │
│  Shows: confidence drops, source-market shifts, drift       │
│  Visual: muted, awareness-only with optional review         │
├─────────────────────────────────────────────────────────────┤
│  BOTTOM ZONE: ROUTINE CONFIRMATIONS                          │
│  Auto-approved decisions in last 24h                        │
│  Visual: collapsed by default, batch-confirm action         │
└─────────────────────────────────────────────────────────────┘

Sidebar (right):
  - Owner messages awaiting response
  - Strategy memos expiring this week
  - Comp set drift alerts (one of your 15 comps moved >20%)
  - Quarterly review backlog
```

## Active escalation row template

```
┌─────────────────────────────────────────────────────────────────────┐
│ [🔴 HARD_BLOCK]  Marina Heights 2BR · Dec 28-31  · AED 8,400 impact  │
│                                                                      │
│ Agent proposed: AED 4,200/night (3.5x current)                       │
│ Confidence: 0.81 · NYE event premium + UK source market strong       │
│                                                                      │
│ Blocked by: ±50% daily move guardrail                                │
│ Runner-up at AED 3,200 would pass guardrail (predicted RevPAR       │
│ AED 2,850 vs AED 3,400 at proposed)                                  │
│                                                                      │
│ [Approve at 4200]  [Approve runner-up at 3200]  [Modify]  [Reject]   │
│                                                                      │
│ ▸ Show full reasoning  ▸ Show audit trail  ▸ Show comp set state     │
└─────────────────────────────────────────────────────────────────────┘
```

## Six escalation types

Each has its own row template and action set.

### 1. PriceGuard hard_block
Agent proposed a price violating a hard guardrail.
Actions: approve as proposed (override guardrail), approve runner-up, modify manually, reject and ask agent to retry.

### 2. PriceGuard flag_review
Unusual proposal but not blocked.
Actions: approve, modify, reject.

### 3. Anomaly Detector critical
Velocity collapse, price cliff, data staleness, engine failure.
Actions: rollback, investigate, dismiss.

### 4. Confidence drop
Elasticity model confidence on a property dropped below threshold.
Actions: review last 7 days of decisions, retrain trigger, dismiss.

### 5. Source-market shift
Property's source-market mix shifted >15% week-over-week.
Actions: review pricing strategy, approve auto-recalibration, defer to quarterly review.

### 6. Owner override pending review
Owner manually changed an agent-set price.
Actions: confirm owner is right (lock guardrail at owner's price), revert to agent (override owner with note), discuss with owner.

## Watch zone items

Lower-severity, awareness-only:
- Comp set drift (any comp moved >20% in last 7d)
- Booking pace deviation (property's pace ±25% of trailing)
- Listing quality signal change (guest_signals trend shifted)
- Strategy memo nearing expiry (within 14 days of quarterly review date)

## Routine confirmations zone

Auto-approved decisions from the last 24 hours, collapsed by default:

```
[ Routine: 47 auto-approved decisions in last 24h ]

  [ ] Marina Heights 1BR · 12 nights · all within ±3% of proposed
  [ ] Downtown Burj 1BR · 8 nights · all within ±5% of proposed
  [ ] Palm Signature 3BR · 5 nights · all within ±4% of proposed
  ... 19 more rows

[ Confirm all (47) ]   [ Spot-check 5 random ]   [ Review individually ]
```

## Sidebar

```
OWNER MESSAGES (3)
  - Ahmed (Marina Heights): "Can we discuss next week's pricing?"
  - Fatima (Downtown Burj): "Owner blocked Dec 15-20"
  - Karim (Palm Signature): "Cancellation policy question"

STRATEGY MEMOS EXPIRING THIS WEEK (2)
  - Marina Pearl 1BR  (last refresh 87 days ago)
  - Downtown Tower 2BR (last refresh 91 days ago)

COMP DRIFT ALERTS (4)
  - Marina Heights: comp "Address Residences 12F" moved +18% in 5d
  - Marina Pearl: comp "Princess Tower 9F" went off-market 3d
  - Palm Sig: comp "FIVE Palm 2BR" moved -12% in 2d
  - Downtown Burj: comp "Address Downtown 1BR" moved +14% in 4d

QUARTERLY REVIEW BACKLOG (5)
  - 5 properties due quarterly memo refresh in next 30 days
```

## Header filters

```
Property: [ all ▾ ]   Type: [ all ▾ ]   Severity: [ ≥ flag ▾ ]
Date range: [ next 14d ▾ ]   Sort: [ revenue_impact ▾ ]
```

---

## API contract

### GET /rm/queue

```
GET /rm/queue?rm_id=<uuid>&filters={...}

Response:
{
  "active": [
    {
      "decision_id":      "<uuid>",
      "row_template":     "hard_block",
      "severity":         "high",
      "property_name":    "Marina Heights 2BR",
      "target_dates":     ["2026-12-28", "2026-12-29", "2026-12-30",
                          "2026-12-31"],
      "revenue_impact_aed": 8400,
      "agent_proposal":   {
        "price":            4200,
        "change_pct":       2.5,
        "p_book":           0.62,
        "expected_revpar":  2604,
        "confidence":       0.81
      },
      "runner_up": {
        "price":            3200,
        "expected_revpar":  2850
      },
      "blocked_by":       "max_daily_pct_move (current 50%)",
      "rationale":        "NYE event premium + UK source market strong",
      "available_actions": [
        {"action": "approve_proposed", "label": "Approve at 4200"},
        {"action": "approve_runner_up", "label": "Approve at 3200"},
        {"action": "modify",            "label": "Modify"},
        {"action": "reject",            "label": "Reject"}
      ],
      "links": {
        "audit_trail":   "/audit/decision/<uuid>",
        "reasoning":     "/audit/decision/<uuid>/reasoning",
        "comp_set":      "/comps/state/<property_id>/2026-12-28"
      }
    }
  ],
  "watch": [...],
  "routine_summary": {
    "count":          47,
    "total_revenue":  62000,
    "by_property":    [...]
  },
  "sidebar": {
    "owner_messages":           [...],
    "expiring_strategy_memos":  [...],
    "comp_drift_alerts":        [...],
    "quarterly_backlog":        [...]
  }
}
```

### POST /rm/action

```
POST /rm/action

Request:
{
  "rm_id":          "<uuid>",
  "decision_id":    "<uuid>",
  "action":         "approve_proposed" | "approve_runner_up" | "modify" 
                    | "reject" | "rollback" | "dismiss",
  "modified_price": 1380,           # only if action=modify
  "modified_min_stay": 2,
  "rationale":      "Owner asked for tighter weekend pricing"
}

Response:
{
  "action_id":       "<uuid>",
  "outcome":         "applied",
  "pms_push_status": "queued"        # if action triggers PMS push
}
```

### POST /rm/action/batch

```
POST /rm/action/batch

Request:
{
  "rm_id":         "<uuid>",
  "decision_ids":  ["<uuid>", "<uuid>", ...],
  "action":        "confirm_routine"
}

Response:
{
  "batch_id":     "<uuid>",
  "applied":      47,
  "failed":       0
}
```

---

## Surfacing logic (computed by service)

```python
def compute_escalation_surface(decision_id):
    decision = load_decision(decision_id)
    outcome_window = compute_outcome_window(decision.target_date)
    revenue_impact = estimate_revenue_at_stake(decision)
    severity = compute_severity(decision, outcome_window)
    runner_up = load_runner_up_from_decision(decision)

    return {
        "row_template":    map_to_template(decision.outputs.verdict),
        "severity":        severity,
        "revenue_impact_aed": revenue_impact,
        "agent_proposal":  extract_proposal(decision),
        "runner_up":       runner_up,
        "blocked_by":      extract_blocking_guardrail(decision),
        "rationale":       decision.outputs.rationale,
        "available_actions": map_actions(decision.outputs.verdict),
        "links": {
            "audit_trail":   f"/audit/decision/{decision_id}",
            "reasoning":     f"/audit/decision/{decision_id}/reasoning",
            "comp_set":      f"/comps/state/{decision.property_id}/{decision.target_date}"
        }
    }

def estimate_revenue_at_stake(decision):
    """Sum across all affected target dates the gap between agent's 
    chosen price and the current locked price, weighted by P(book)."""
    affected_dates = decision.outputs.target_dates
    total = 0
    for date in affected_dates:
        proposal = decision.outputs.proposals[date]
        delta = proposal.chosen_price - proposal.current_price
        weighted = delta * proposal.p_book
        total += weighted
    return total
```

---

## Frontend stack

- Next.js 14+ App Router
- React Server Components for the queue list (server-rendered, fast)
- Tailwind CSS
- Tanstack Query for queue refetching (30s stale, 60s refetch)
- WebSocket or SSE for real-time updates on critical alerts
- Hosted on Vercel

## Authentication

- Clerk (or Auth0) for RM logins
- Single org tenancy in v1 (one RM team per Cozmo customer org if multi-tenant)
- Audit log of every RM action is the source of truth for "who did what"

## Mobile

- Mobile-responsive (RMs check escalations on phone after hours)
- Critical alerts push via Slack DM (integration with rm_actions table)
- Full dashboard usability on tablet, read-only on phone for v1

---

## RM productivity targets

```
Daily flow at 150-200 properties (one RM):

  09:00-10:30   Top zone (5-15 escalations)
  10:30-11:30   Owner check-in calls (rotating)
  11:30-12:30   Watch zone review
  13:30-15:00   Comp set drift, sidebar items
  15:00-16:30   Anomaly Detector alerts
  16:30-17:30   Routine batch confirmations
  17:30-18:00   End-of-day notes

Throughput targets:
  Items resolved per hour:    15-20
  Escalation SLA:             hard_block within 4h business time
                              critical anomaly within 1h
  Owner NPS:                  ≥ 50 monthly
  Override rate:              <15% by day 60
```

---

## Audit and observability

Every dashboard action writes to `rm_actions`. The dashboard backend logs:
- Time-on-page per row
- Click path through escalation rows
- Most-used filter combinations
- Average time from queue arrival to action

These power product improvements (which row templates need redesign, which filters are unused).

## Out of scope for v1

- Mobile-first design (mobile-responsive only)
- Multi-RM team workflows with assignments and handoffs
- RM-to-RM internal chat
- Integrated Zoom for owner calls (use external)
- Custom dashboards per RM

These move to v2 once one-RM-per-customer-org operations are validated.
