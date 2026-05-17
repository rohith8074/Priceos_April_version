# Pricing, Tiers, and Performance Contract

## What changed

Three-tier productization replaces flat "AED 100/unit/month." Performance-fee SKU added in year 2 once track record exists. Standalone diagnosis report priced as wedge.

## Why

The user's instinct was AED 100 flat (PriceLabs parity), evolving to AED 200 with reservation management. The honest read:
- AED 100 flat positions PriceOS as a tool, undifferentiated from PriceLabs
- AED 200 with "reservation management" undersells what's delivered if it means full ops, or is correctly priced if it means software-only Maya + sync
- Performance fee is the right destination but not the right starting point during validation

The tiered structure separates "tool" from "AI RM" from "managed RM" cleanly so customer expectations match deliverables.

## Impact on product

- Customer acquisition stays cheap (Tier 1 at AED 100 removes pricing friction)
- Upsell path exists (Tier 2 at AED 200 for AI-driven guest comms, Tier 3 at AED 400-600 for human RM)
- Performance-fee variant available year 2 for sophisticated customers who want shared upside
- Diagnosis report at AED 999 is the wedge that pays for the first sales call

---

## Tier structure

### Tier 1 — PriceOS (flat)
**Price**: AED 100/unit/month
**Includes**:
- Agent (all of PriceOS v3 architecture)
- Audit log + replay
- RM dashboard (self-service for property manager)
- Daily memo per property
- Comp set scrape and maintenance
- Regime + source-market intelligence
- Hostaway integration

**Excludes**:
- Maya (guest comms automation)
- Human RM oversight

**Position**: PriceLabs replacement at PriceLabs price, but with audit trail and learning loop.

### Tier 2 — PriceOS Pro
**Price**: AED 200/unit/month
**Includes everything in Tier 1, plus**:
- Maya (guest comms automation)
- Channel sync across Airbnb, Booking.com, Direct
- Owner daily memo with deeper analysis
- Quarterly strategy memo refresh (self-service via dashboard)

**Excludes**:
- Active human RM oversight

**Position**: AI Revenue Manager. The "agent + automated comms" SKU.

### Tier 3 — PriceOS Managed
**Price**: AED 400-600/unit/month (varies by portfolio size and complexity)
**Includes everything in Tier 2, plus**:
- Named human RM
- Weekly Zoom touch with owner
- Quarterly strategy memo (RM-led, owner-co-written)
- Active escalation handling on RM dashboard
- Anomaly investigation
- Source-market shift response

**Position**: For property management companies and owners who want hands-off operation.

### Year-2 SKU — PriceOS Co-Managed (performance variant)
**Price**: AED 200/unit/month base + 10-12% on measured uplift over regime-adjusted baseline
**Includes**: Tier 3 services
**Position**: For sophisticated customers (CFOs at large PMs) who want shared upside. Requires the performance contract from this folder to be in production for 6 months minimum before launch.

---

## Pricing path

```
Months 0-3:    Tier 1 only at AED 100. Get to 30+ paying.
Months 3-6:    Add Tier 2 at AED 200 once Maya is hardened.
               Existing customers can opt up.
Months 6-12:   Add Tier 3 at AED 400-600 once RM is hired and trained.
               Pitch to largest property management companies first.
Year 2+:       Co-Managed performance SKU.
```

---

## Diagnosis report (the wedge)

**Standalone price**: AED 999, fully credited against first 3 months of any tier subscription.

**Free for first 10 Dubai operators** (already established).

**What's in it**:
- Forensic post-mortem of last 12 months on connected properties
- Specific dates, specific lost revenue, in dirhams, sourced from 24mo Hostaway data
- Three sections per property:
  - Underprice losses (charged below market on booked nights)
  - Overprice losses (charged above market on unsold nights)
  - Orphan night and LOS losses (gaps never closed)
- One number per property: total recoverable revenue last 12 months
- One number for portfolio: total recoverable across all units
- Backtest projection: what PriceOS would have priced, regime-adjusted

**Time to deliver**: 1 hour from PMS connection to report draft, 24 hours to polished version.

**Conversion target**: 60% of report recipients convert to a paid tier within 30 days.

---

## Performance contract template (Year 2 SKU)

This is the legal-grade definition of uplift that survives a CFO read.

```
PRICEOS PERFORMANCE-FEE ADDENDUM

1. PURPOSE

This addendum defines how PriceOS measures and bills the 
performance component of its fees. It supplements the master 
service agreement.

2. DEFINITIONS

"Property" means a single listing managed by Customer and onboarded 
to PriceOS, identified by Customer in the property registry.

"Available Night" means a calendar night during the Measurement 
Period when the Property was offered for booking. Owner-blocked 
nights, maintenance closures, and force-majeure closures are 
excluded.

"Realized RevPAR" for a Property in a month equals 
(sum of nightly revenue from confirmed, non-cancelled stays 
attributable to nights in that month) ÷ (Available Nights in that 
month). Revenue is net of platform commissions paid to OTAs and 
net of payment-processing fees.

"Baseline RevPAR" for a Property in a month equals the 
trailing-twelve-month average RevPAR of that Property, recomputed 
each month, with the following adjustments applied in order:
  (a) Seasonality: weight prior-year same-month RevPAR with 60% 
      weight and trailing-12mo with 40% weight.
  (b) Regime adjustment: multiply by the published regime modifier 
      for the Property's market for the Measurement Period 
      (regime modifier values and methodology disclosed in 
      Schedule A).
  (c) Capacity: if Customer added or removed inventory within the
      Property in the Measurement Period, prorate.
  (d) Listing changes: a Material Listing Change (defined in 
      Schedule B) resets the Baseline with a fresh trailing window 
      starting on the change date.

For Properties under six months of operation, Baseline RevPAR uses
the cluster median Baseline (Schedule C) instead of the Property's 
own history.

"Uplift" for a Property in a month equals 
MAX(0, Realized RevPAR − Baseline RevPAR) × Available Nights.

"Performance Fee" for a Property in a month equals 12% × Uplift, 
subject to the cap in Section 5.

3. MEASUREMENT PERIOD

The Measurement Period is each calendar month. The performance fee 
is computed and invoiced in arrears, no later than the 15th 
business day of the following month.

4. AUDIT RIGHTS

Customer may, upon five business days notice, audit the calculation 
of any month's Performance Fee for up to twelve months of history.
PriceOS will provide:
  (a) The full input data (calendar, reservations, channel mix) 
      used for the calculation.
  (b) The Baseline RevPAR computation including each adjustment.
  (c) The Realized RevPAR computation.
  (d) The audit-trail decision_ids for every pricing decision in 
      the period (read-only access to the audit log).

Disputes that cannot be resolved within ten business days will be 
referred to an independent third-party auditor agreed by both 
parties, fees split equally.

5. CAP, FLOOR, AND FORCE MAJEURE

The Performance Fee for any single Property in any single month is 
capped at AED 8,000.
The Performance Fee for any single Property in any single month is 
floored at AED 0.
If, in PriceOS's published regime score, the Property's market 
enters Regime Label "crisis" (regime_score ≥ 0.8), Customer may 
elect to pause Performance Fees for the duration of that regime 
plus 30 days. Platform Fees continue.

6. EXAMPLE WORKED IN DIRHAMS

Property: Marina Heights 1BR
Available Nights in May: 30
Trailing-12mo RevPAR: AED 1,000
Prior-year May RevPAR: AED 1,200
Seasonality-adjusted baseline: 0.4 × 1,000 + 0.6 × 1,200 = AED 1,120
Regime modifier May (watch regime, score 0.35): 0.92
Adjusted Baseline RevPAR: AED 1,120 × 0.92 = AED 1,030
Realized RevPAR May: AED 1,180
Uplift: (1,180 − 1,030) × 30 = AED 4,500
Performance Fee: 12% × 4,500 = AED 540

7. WHAT IS NOT IN BASELINE

Baseline does not include revenue from extended stays of 28 nights 
or more (the "Airbnb tax" exemption). Those bookings are tracked 
separately and excluded from both Realized and Baseline RevPAR.

Baseline does not include cleaning fees, security deposits, or 
ancillary revenue. Only nightly accommodation revenue.

8. CHANGES TO METHODOLOGY

PriceOS may update the Baseline methodology with 60 days written 
notice. Customer may terminate this addendum on 30 days notice if 
they reject the update.
```

### Schedules referenced

**Schedule A**: Regime modifier methodology. Documents the regime classifier feature set, weights, training procedure, and audit log of any methodology changes.

**Schedule B**: Material Listing Change definition. Examples:
- Photo refresh of >50% of images
- Bedroom count change (renovation)
- Major amenity addition (pool, hot tub, etc)
- Tier reassignment via cluster algorithm

**Schedule C**: Cluster median baseline computation. Per-cluster RevPAR median, refreshed monthly, used as fallback for new properties under 6 months.

---

## Worked unit economics

### Tier 1 (AED 100/unit/month)

Marina 2BR doing AED 25k/month gross:
- Customer cost: AED 100/month = 0.4% of gross
- PriceOS LLM cost: ~AED 11/month
- PriceOS gross margin per unit: ~AED 89/month = 89%

### Tier 2 (AED 200/unit/month)

Same property:
- Customer cost: AED 200/month = 0.8% of gross
- PriceOS LLM cost: ~AED 22/month (Maya doubles LLM volume)
- PriceOS gross margin per unit: ~AED 178/month = 89%

### Tier 3 (AED 500/unit/month average)

Same property:
- Customer cost: AED 500/month = 2% of gross
- PriceOS LLM cost: ~AED 22/month
- RM allocation: ~AED 200/month per property (RM at AED 350k/yr ÷ 175 properties ÷ 12)
- PriceOS gross margin per unit: ~AED 278/month = 56%

### Year-2 Co-Managed

Same property, performance variant:
- Base: AED 200/month
- Performance fee on AED 1,250/month uplift × 12% = AED 150/month
- Total customer cost: AED 350/month = 1.4% of gross
- PriceOS LLM + RM cost: ~AED 222/month
- PriceOS gross margin per unit: ~AED 128/month = 37%

The Co-Managed tier has lower per-unit margin but aligns incentives and unlocks the largest customers (PMs with 50+ units who want shared risk).

---

## ARR projections

```
Scenario: 100 properties at end of year 1, 60/30/10 split across Tier 1/2/3

Tier 1: 60 × AED 100 × 12 = AED 72,000
Tier 2: 30 × AED 200 × 12 = AED 72,000
Tier 3: 10 × AED 500 × 12 = AED 60,000

Year 1 ARR: AED 204,000

Scenario: 500 properties at end of year 2, 30/40/20/10 split across 
Tier 1/2/3/Co-Managed

Tier 1: 150 × AED 100 × 12         = AED 180,000
Tier 2: 200 × AED 200 × 12         = AED 480,000
Tier 3: 100 × AED 500 × 12         = AED 600,000
Co-Mgd: 50  × (AED 200 + AED 150 avg perf fee) × 12 = AED 210,000

Year 2 ARR: AED 1,470,000
```

---

## Sales positioning per tier

### Tier 1 elevator
"PriceLabs gives you a number. PriceOS gives you the number plus the receipt. Same price as PriceLabs, but every decision is auditable, replayable, and learns from your actual bookings. AED 100 per unit per month."

### Tier 2 elevator
"PriceOS Pro adds the AI agent that handles guest comms automatically. Maya replies to inquiries, sends access codes, escalates legal threats, and manages upsells. Same agent that prices your inventory now also handles the conversations that come with it. AED 200 per unit per month."

### Tier 3 elevator
"PriceOS Managed gives you a named human revenue manager working alongside the agent. They own your strategy memos, run your weekly check-ins, and handle every escalation that needs human judgment. The agent does the routine work, the RM owns the relationship and the judgment calls. AED 400 to 600 per unit per month."

### Co-Managed elevator
"For property management companies who want shared upside: pay AED 200 per unit per month flat, plus 12% of measured uplift over your regime-adjusted baseline. We get paid only when you actually make more money than your trailing twelve months adjusted for market regime. Performance fee capped at AED 8,000 per unit per month, force-majeure pause clause for crisis regimes."

---

## What this pricing structure deliberately does not do

- No "freemium" tier. The diagnosis report is the free wedge, but the product itself is paid from day one.
- No usage-based pricing on number of decisions or API calls. Per-unit-per-month is the unit operators understand.
- No discount tiers below AED 100. Below that, you signal commodity.
- No annual prepay discount in year 1. Take month-to-month, prove value, lock in year 2 with annual prepay at 10% discount.
- No referral discounts in year 1. Customers who refer get a referral fee in cash, not a discount on their own subscription. Discounts erode pricing integrity.
