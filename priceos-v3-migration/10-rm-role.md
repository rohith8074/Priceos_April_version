# Human RM Role: Hiring, Onboarding, Compensation

## What changed

A new operating role exists in the org chart: the Revenue Manager. The RM is paid in leverage, not in hours. One RM at 150-200 properties replaces what would otherwise be 5-7 RMs in a traditional agency.

## Why

Resolves operational requirement for Tier 3 (Managed) SKU. Without an RM bench, the AED 400-600/unit/month tier cannot deliver. The RM role is also the source of the highest-quality training labels for the elasticity model (every RM correction is a labeled override).

## Impact on product

- Tier 3 becomes deliverable
- Compounding intelligence: every RM action is labeled training data
- Customer NPS rises because owners have a named human to call
- One RM hire unlocks AED 600k+ in additional ARR (150 properties × AED 400/month)

---

## Job specification

### Title
Revenue Manager (PriceOS)

### Location
Dubai (in-person preferred for first 12 months, remote-eligible after)

### Background profile (in priority order)

**Tier 1 hire**:
- 3-5 years revenue management experience in Dubai STR or hotel
- Comfortable with data, dashboards, pivot tables
- Strong owner relationship skills
- Arabic + English (50%+ of UAE owners prefer Arabic)
- Willingness to learn an agent-augmented workflow

**Where to source**:
- Former PriceLabs or AirDNA customer-success staff
- Hostaway customer-success and onboarding alumni
- DHHA member RM staff at small property managers
- Ex-hotel revenue management (Marriott, Accor, Jumeirah)
- Boutique RM agencies in Dubai (Roya, Lavanda, GuestReady alums)

### Day-to-day

```
The RM does NOT compose pricing. The agent does.
The RM referees the agent.

Daily flow:
  09:00-10:30   Top zone escalations (5-15 items)
  10:30-11:30   Owner check-in calls (rotating)
  11:30-12:30   Watch zone review
  13:30-15:00   Comp set drift, sidebar items
  15:00-16:30   Anomaly Detector alerts
  16:30-17:30   Routine batch confirmations
  17:30-18:00   End-of-day notes
```

### Must-haves
- Detail orientation (every action gets a rationale logged)
- Communication clarity (owner-facing writing and calls)
- Statistical literacy (read calibration plots, understand p-values)
- Composure under volatility (war regime weeks need calm)

### Nice-to-haves
- Prior STR ownership experience
- Property management software fluency (Hostaway, Guesty)
- Spreadsheet wizard

### Anti-patterns (don't hire)
- "I do everything manually, AI can't replace me" — they fight the agent
- Pure salesperson without ops chops
- Pure analyst without owner-facing skills
- Anyone who needs to be the smartest in the room (they will override the agent)

---

## 90-day onboarding

### Week 1 (Days 1-5): Onboarding to the system

- Day 1: Read the v3 architecture deck. Understand the 10 agents, the new workflows, the audit log, the dashboard. 4 hours.
- Day 1-2: Shadow founder for 2 calls, 1 dashboard hour, 1 escalation review.
- Day 2-3: Read 5 pre-existing strategy memos. Understand structure, baseline, guardrails.
- Day 3-4: Walk through the dashboard with product team. Ask about every column, every action, every escalation type.
- Day 4-5: Read regime classifier output and source-market breakdown for 3 properties.

**Output**: capable of opening the dashboard alone and explaining what each row means.

### Weeks 2-4 (Days 6-20): Strategy memos for all 30 properties

Three properties per business day, 10-12 properties per week. Each memo is a 30-min owner conversation plus 30-min writing.

**Memo template per property**:
- Property identity: name, area, bedrooms, tier, cluster
- Current baseline (trailing-12mo ADR, occupancy, RevPAR)
- Target positioning: where in comp set should this property sit (P25/P50/P75/P90)
- Source-market mix today and target mix
- Channel mix today and target mix
- Guardrails: floor_price, ceiling_price, max_daily_pct_move, max_weekly_drift_pct, max_event_premium_pct
- Blackout dates: owner stays, maintenance windows, hard holds
- Listing quality notes: what to fix in photos, copy, amenities
- Force-majeure clause activation criteria
- Owner sign-off

**Owner conversation script** (30 min, recorded for training):
- Walk owner through their diagnosis report (anchors the sale)
- Walk through proposed strategy memo
- Negotiate guardrails (owners always want tighter, RM explains tradeoff)
- Lock baseline date
- Owner signs off

**Output**: 30 locked strategy memos by end of week 4. Owner relationships established. Baselines locked for performance fee calculation.

### Weeks 5-8 (Days 21-40): First operational period

Daily flow as defined above. Track override patterns. Review with product team weekly.

Owner cadence:
- Week 5: every owner gets 20-min call from RM
- Week 6+: rotating weekly Zoom with 1/4 of owners (each owner monthly)
- Daily: every owner gets auto-generated daily memo, RM CC'd on replies

Override pattern tracking: every override the RM makes is captured in `rm_actions`. After day 30, RM and product review top override patterns.

**Throughput targets**:
- Day 1: 50-100 escalations/day (everything new)
- Day 30: 20-40 escalations/day (model has learned)

### Weeks 9-12 (Days 41-90): Steady state

- Hard_block rate drops from ~5% to ~2%
- Override rate drops from ~25% to ~12%
- Watch zone shrinks
- Routine batch grows
- RM has more time for owner relationships

Quarterly strategy refresh begins. Each property's strategy memo gets a 90-day review.

Capacity expansion: RM begins onboarding properties 31-50 alongside existing portfolio.
- At 50 properties, RM is at ~70% utilization
- At 100 properties, full utilization
- Beyond 150 properties, hire second RM

---

## KPIs (reviewed weekly)

| KPI | Target | Why |
|---|---|---|
| Override rate | trending below 15% by day 60 | Trust signal |
| Escalation throughput | 15-20 items/hour | Productivity |
| Owner NPS | ≥ 50 monthly | Customer health |
| Portfolio RevPAR delta vs baseline | +5% rolling 30d | Performance |
| Audit completeness | 100% (every action has a logged rationale) | Compliance + training data |
| Hard_block SLA | resolved within 4h business time | Owner trust |
| Critical anomaly SLA | resolved within 1h business time | Crisis response |

## Compensation structure

```
Base salary AED 18,000-25,000/month
  (senior MENA STR RM market rate)

Performance bonus components:
  Portfolio uplift bonus:
    0.5% of measured uplift on RM's portfolio
    capped at 25% of base salary annualized
  
  Owner NPS bonus:
    AED 2,000 quarterly if portfolio NPS ≥ 60
  
  Override rate bonus:
    AED 1,500 quarterly if override rate stayed <12% for the quarter
  
  Escalation SLA bonus:
    AED 1,000 quarterly if SLA hit ≥ 95% of cases

Total annual comp range:
  Base case (50 properties, +3% uplift, NPS 55):  ~AED 270,000
  Strong case (150 properties, +6% uplift, NPS 70): ~AED 380,000
```

## Why pay this much

- Strong RMs have offers from PMs paying 15-25% of revenue on portfolios that bill seven figures. They're expensive in MENA.
- The RM role generates training labels worth far more than salary in compounded model improvement.
- Cheap RM hiring underdelivers Tier 3, which kills the ARPU thesis.
- Two RMs at AED 350k/year cover 300+ properties at AED 500/month/property = AED 1.8M ARR. Net margin at this layer is healthy.

---

## Reporting structure

```
Founder (year 1)
  └─ Revenue Manager (1 hire, year 1)
       └─ Revenue Manager #2 (year 2, when portfolio > 150 units)
            └─ Revenue Manager #3 (year 2, when portfolio > 300 units)

Founder (year 2+)
  └─ Head of Revenue Operations
       └─ Senior RM (manager of RMs)
            ├─ RM
            ├─ RM
            └─ RM
```

Year 1 the founder is the RM's manager and the RM's coach. The product roadmap is partly informed by the RM's daily friction. By year 2 a Head of RevOps owns the team and the founder steps back to product strategy.

---

## How the RM compounds the product

Every RM action is captured in `rm_actions`:

```
RM modifies an agent price → labeled correction
  Feeds into elasticity model retraining as "the agent was off by X here, 
  in this regime, with this source-market mix, the right answer was Y."

After 3 months of RM operation:
  ~3,000 labeled corrections
  Identifies systematic biases in the agent (e.g., "always undershoots 
  Marina premium on weekends in calm regime")
  Drives prompt refinement and elasticity feature additions

After 6 months:
  ~6,000 labels
  Override rate drops measurably as the agent absorbs RM judgment
  Tier 2 customers (no RM) benefit from improvements driven by Tier 3 
  customers (with RM)

Cross-tier learning:
  The RM exists at Tier 3, but the labels they generate improve the 
  agent for everyone. This is the network effect.
```

---

## When you hire #2 and #3

Hire #2:
- Active portfolio crosses 120 properties
- Hire #1 over 70% utilization for 4 consecutive weeks
- Forecast 50+ new properties next quarter

Hire #3:
- Active portfolio crosses 240 properties
- Both #1 and #2 over 70% utilization
- Geographic split makes sense (one Marina-focused, one Downtown-focused)

Hire boundaries (do NOT hire #2 yet):
- If override rate is still >18% after 90 days
- If portfolio NPS below 45
- If model improvements should be addressing the volume before more humans

The principle: if the agent is improving fast enough, you can defer hires. If the agent has plateaued, throwing more humans at the problem doesn't fix it. Fix the agent first.

---

## The RM's tools (recap)

The RM operates entirely through the RM dashboard (`07-rm-dashboard.md`). The dashboard exposes:
- Active escalations queue (sorted by revenue impact)
- Watch zone (lower-severity awareness items)
- Routine confirmations (batch operations)
- Sidebar (owner messages, expiring memos, comp drift, quarterly backlog)

Outside the dashboard, the RM uses:
- Zoom for owner calls (separate)
- Email for written owner correspondence (CC'd)
- Slack for internal team comms
- Google Meet for weekly product team sync

The RM does NOT use Lyzr Studio directly. The RM does NOT see audit logs in raw form (they see them through the dashboard). The RM does NOT need to understand the elasticity model math, only the calibration metric and what it implies for trust.
