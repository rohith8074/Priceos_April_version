# Models and Training

## What changed

Three new models replace heuristic logic that was previously hardcoded in agent prompts:

1. **Elasticity model**: hierarchical Bayesian P(book | price, features). Replaces multiplier formula in PriceGuard.
2. **Regime classifier**: continuous regime score 0 to 1 per city per day, with per-source-market modifiers. Replaces 4-tier geopolitical protocol and news_factor.
3. **Segment profiles**: 60 profiles (cluster × top-10 source markets) capturing per-segment behavior. Powers the source-market modifier.

Plus the cluster definitions and the 24-month labeling protocol.

## Why

Resolves shortcomings:
- 7 (formula too tight): elasticity model represents the real response surface
- 8 (no elasticity): this is the elasticity model
- 9 (no exploration): exploration is built on top of the elasticity posteriors
- 10 (news factor naive): replaced by regime classifier
- 11 (geopolitical coarse): replaced by continuous regime classifier
- 12 (no source-market segmentation): segment profiles + modifier
- 13 (no baseline regime): regime classifier output flows into anomaly detection and contract baseline

## Impact on product

- PriceGuard's prices reflect actual demand response, not multiplier arithmetic
- War regimes get continuous, calibrated handling (no cliff transitions)
- Russian-heavy and Indian-heavy properties priced differently in same regime
- Validation possible because every prediction has a measured outcome

---

## Cluster definitions

Six clusters cover the current 30 UAE properties. Extends cleanly to 100, 500, 1000.

```yaml
clusters:
  - cluster_id: dxb_marina_1br_premium
    bedrooms: studio_or_1
    area: marina_jbr_premium_buildings
    tier: premium                 # ADR p75+, sea/marina view, high floor
    expected_count: 6-8

  - cluster_id: dxb_marina_1br_standard
    bedrooms: studio_or_1
    area: marina_jbr
    tier: standard                # ADR p25-p75
    expected_count: 5-7

  - cluster_id: dxb_marina_2br
    bedrooms: 2
    area: marina_jbr
    tier: any
    expected_count: 4-5

  - cluster_id: dxb_downtown_1br_premium
    bedrooms: studio_or_1
    area: downtown_difc
    tier: premium                 # Burj view or DIFC walk
    expected_count: 4-6

  - cluster_id: dxb_palm_2_3br_premium
    bedrooms: 2_or_3
    area: palm_jumeirah
    tier: premium                 # beachfront, view, signature buildings
    expected_count: 3-4

  - cluster_id: dxb_other
    fallback: true                # Business Bay, JLT, Greens, other
    expected_count: 3-5
```

Cluster assignment is automatic from listing metadata:

```python
def assign_cluster(property):
    bedrooms = bucket_bedrooms(property.bedrooms)   # studio_or_1, 2, 3+
    area = polygon_lookup(property.coordinates)     # named area polygon
    tier = compute_tier(property)                   # see below
    return CLUSTER_RULES.match(bedrooms, area, tier) or "dxb_other"

def compute_tier(property):
    area_distribution = get_area_adr_distribution(property.area)
    own_adr = property.trailing_12mo_adr
    percentile = compute_percentile(own_adr, area_distribution)

    has_view = property.amenities.includes_any(['sea_view', 'marina_view',
                                                'burj_view', 'palm_view'])
    is_high_floor = property.floor >= 20

    if percentile > 0.75 and (has_view or is_high_floor):
        return "premium"
    elif percentile < 0.25:
        return "value"
    else:
        return "standard"
```

Cluster reassignment runs quarterly. A property whose tier shifts moves cluster at the next refresh.

---

## Elasticity model

Hierarchical Bayesian logistic regression. Predicts P(night books before check-in | price, features), updated nightly.

### Model form

```
P(book_by_checkin | price, features) = sigmoid(
    β₀
  + β₁  · log(price / comp_set_median)
  + β₂  · lead_time_days
  + β₃  · log(lead_time_days)
  + β_dow · day_of_week_one_hot
  + β_mo  · cyclical_month_encoding
  + β₄  · comp_set_occupancy_pct
  + β₅  · pace_index_vs_trailing
  + β₆  · regime_score
  + β₇  · source_market_demand_modifier
  + β₈  · event_premium_strength
  + β₉  · listing_quality_score    # from guest_signals
  + β₁₀ · min_stay_setting
  + property_random_effect
  + cluster_random_effect
)
```

### Hierarchy

- Global priors → cluster random effect → property random effect
- Bayesian shrinkage so a new property anchors on cluster behavior, then own data takes over

### Initial priors

| Coefficient | Prior mean | Prior std | Source |
|---|---|---|---|
| β₁ price elasticity | -1.7 | 0.4 | STR research, AirDNA published work, ε ≈ -1.5 to -2.0 |
| β₂ lead_time linear | -0.005 | 0.003 | Calibrate from 24mo Hostaway |
| β₃ log(lead_time) | 0.4 | 0.15 | Calibrate from 24mo Hostaway |
| β₆ regime_score | -0.3 | 0.2 | Soft prior, regime hurts booking |
| β_dow weekend | +0.25 (Fri/Sat) | 0.15 | Cluster-level prior from Dubai pattern |
| β₈ event_premium | +0.4 | 0.2 | Strong positive |
| β₉ listing_quality | +0.5 | 0.2 | Strong positive |

### Training procedure

```
1. Pull Hostaway 24mo history per property.
2. Generate observations per (property, target_date, observation_lead_time):
   - For nights that booked, generate observations at lead_time = 
     {30, 21, 14, 7, 3} days before booking, with the last one as the 
     "booked" event and earlier ones as "not yet booked, but eventually."
   - For nights that did not book, generate observations at the same 
     lead times with all "not booked" labels.
3. Construct features at each observation lead time, using state_snapshots 
   if available (post-week-1) or reconstructed comp/regime state.
4. Fit hierarchical model in PyMC or NumPyro. Use NUTS sampler.
5. Cross-validate on temporal split (train 2024, validate 2025-2026).
6. Save posterior parameters per property to elasticity_posteriors table.
```

Training time at 30 properties × 24mo ≈ 4-6 hours for v0 (pooled cluster model). Hierarchical version ~12 hours, run weekly.

### Online update

Nightly batch:

```python
def nightly_elasticity_update():
    new_outcomes = db.query("""
        SELECT * FROM decision_outcomes
        WHERE created_at > NOW() - INTERVAL '24 hours'
    """)
    for prop_id, observations in group_by_property(new_outcomes):
        prior = load_posterior(prop_id)
        posterior = bayesian_update(prior, observations)
        save_posterior(prop_id, posterior)
        log_drift(prop_id, kl_divergence(prior, posterior))
    
    # Full re-sample weekly to catch any drift the conjugate update misses
    if today.weekday() == 0:  # Monday
        full_resample_all()
```

### Endpoint use

PriceGuard's job is now optimization:

```
1. Build candidate_prices grid (11 prices, log-spaced, trimmed by guardrails)
2. Call /elasticity/predict with candidate_prices
3. Pick max(expected_revpar) where ci_95 upper > 0.4
4. Call /exploration/select for bandit override (5-10% of unbooked nights)
5. Apply guardrail verdict
6. Log
```

### Cold start

For a property with <50 booked nights:
- Use cluster posterior with high variance (3x cluster std)
- Hostaway 24mo history (if any) is bonus signal
- After 50 booked nights: switch to property-specific posterior with cluster prior
- After 200 booked nights: property posterior dominates

---

## Regime classifier

Continuous score 0 (calm) to 1 (peak crisis) per city, daily, with per-source-market modifiers.

### Feature set

Macro / news:
- News volume count, MENA-relevant headlines per day. Source: GDELT (free, 15-min lag), NewsAPI, Aylien, GNews.
- News sentiment, transformer-scored, rolling 7d average.
- Keyword density: war, strike, evacuation, advisory, conflict, ceasefire, escalation.
- Travel advisory level changes. Sources: US State Dept (RSS), UK FCDO (RSS), German MFA, Russian MoFA, Indian MEA. Track changes, not absolute levels.
- Embassy notice volume.

Mobility:
- IATA flight capacity to DXB / AUH, week-over-week change. Source: Cirium / OAG.
- Live flight count. Source: OpenSky Network API (free).
- Flight cancellation rate. Source: FlightAware Firehose / AeroAPI.
- Airline schedule changes.

Hotel / STR macro:
- Dubai DET hotel monthly occupancy and ADR (free, monthly, lagged).
- STR / CoStar Middle East report (paid, weekly).
- Lighthouse rate parity feed (paid, MENA coverage).

First-party (highest signal, cheapest):
- Portfolio booking pace delta vs trailing 90-day same-window baseline.
- Cancellation rate spike on portfolio.
- Lead time distribution shift.
- Inquiry-to-booking conversion change.
- Source-market mix shift on incoming bookings.

Public proxy:
- Google Trends for "Dubai vacation," "Dubai hotel," "Dubai flight."

### Computation pipeline

```
1. Daily batch (06:00 UTC) pulls all features.
2. Each feature normalized to z-score against trailing 24mo baseline 
   for same week-of-year.
3. Composite regime_score = weighted sum of feature z-scores, weights 
   trained from labeled data.
4. Per-source-market modifier: same composite recomputed with 
   source-market-specific feature weights.
5. Output regime_label by binning:
   <0.2  calm
   0.2-0.4  watch
   0.4-0.6  disrupted
   0.6-0.8  peak
   ≥0.8  crisis
6. Trend = sign of 7-day change in score.
```

### Training

```
1. Hand-label 24 months of Dubai weeks (104 rows) — see labeling 
   protocol below.
2. Train LightGBM regression on features → regime_score label.
3. Cross-validate on temporal splits (no future leak).
4. Validate: regime_score should inversely correlate with portfolio 
   booking pace, lagged 0-14 days.
```

### Labeling protocol (24-month set)

One analyst, one to two days. Output: a labeled CSV.

**Labeling unit**: weekly (104 weeks for 24 months).

**Per-week context bundle** (the analyst sees this for each week):

```
Week starting: 2024-10-21
City: Dubai

[News context]
- Top 10 MENA-relevant headlines
- Travel advisory levels active that week (US/UK/DE/RU/IN)
- Embassy notices issued

[Mobility context]
- DXB arrivals delta vs 4-week baseline
- Flight cancellation rate
- Airline schedule changes

[Hotel macro]
- Most recent DET hotel occupancy and ADR
- STR weekly Middle East report excerpt

[First-party]
- Your portfolio booking pace this week vs trailing baseline
- Cancellation rate this week
- Lead time distribution shift

[Notable events scheduled]
- Conferences, holidays, events in or adjacent to this week
```

**Labeling rubric**:

```
calm        regime_score 0.0-0.2
            No active travel advisories above level 2.
            News volume on MENA conflict near baseline.
            Booking pace within ±10% of trailing baseline.

watch       regime_score 0.2-0.4
            Elevated news on MENA but no shutdowns.
            Travel advisories raised to level 2-3 by 1-2 major countries.
            Booking pace soft 10-25%.

disrupted   regime_score 0.4-0.6
            Active conflict events in headlines.
            Travel advisories level 3+ by 3+ major countries.
            Booking pace soft 25-50%.
            Visible flight cancellations or schedule cuts.

peak        regime_score 0.6-0.8
            Major conflict event in or adjacent to UAE airspace.
            Multiple full-country advisories.
            Airline capacity cuts to DXB.
            Booking pace soft 50-75%.

crisis      regime_score 0.8-1.0
            Direct disruption to UAE operations.
            Airport / airspace closure.
            Booking pace effectively zero.
            Mass cancellations.

recovering  modifier flag, not separate score
            Apply when previous 4 weeks were disrupted/peak/crisis and 
            current week shows pace improving 30%+ week-on-week.
```

**Per-segment labeling** (5 min/week per segment):

```
For each of: russia, india, uk, germany, ksa, us, china, "other"

Mark a modifier 0.4 to 1.4:
  0.4-0.6  this segment soft / pulling back
  0.6-0.8  this segment cautious
  0.8-1.0  this segment near baseline
  1.0-1.2  this segment over-indexing
  1.2-1.4  this segment surge

Cite one signal from the context bundle for each non-baseline call.
```

**Workflow**:

```
1. Open week's context bundle.
2. Read top 10 headlines, scan advisories, scan mobility, scan first-party.
3. Pick regime label by rubric.
4. Pick regime_score within band based on intensity.
5. Mark per-segment modifiers, cite signal for each non-baseline.
6. Write 1-line dominant story.
7. Move to next week.
```

**QA pass**:

- Single labeler does full 104 weeks (consistent calibration)
- Founder spot-checks 20 random weeks (10 difficult + 10 random)
- Disagreements stored in disputed_weeks table
- Classifier trains on consensus, validates on disputed

**Output CSV**:

```
week_start_date, regime_label, regime_score, recovering_flag,
russia_modifier, russia_signal,
india_modifier, india_signal,
uk_modifier, uk_signal,
germany_modifier, germany_signal,
ksa_modifier, ksa_signal,
us_modifier, us_signal,
china_modifier, china_signal,
other_modifier,
dominant_story, labeler, label_confidence_1_to_5
```

**Time estimate**: ~14 hours total. Two days fresh analyst, one day if founder.

---

## Segment profiles

60 profiles = 6 clusters × top 10 source markets per cluster.

Each profile captures per-segment behavior, learned from 24mo Hostaway history filtered to that cluster + that source country.

```yaml
profile:
  cluster_id: dxb_marina_1br_premium
  country_code: russia
  share_of_bookings: 0.22
  lead_time_distribution:
    p25: 14
    p50: 28
    p75: 62
  los_distribution:
    p25: 4
    p50: 7
    p75: 14
  channel_preference:
    airbnb: 0.18
    booking: 0.71
    direct: 0.09
    vrbo: 0.02
  weekend_premium_coef: 1.18
  weekday_softness_coef: 0.94
  price_elasticity: -1.4
  regime_advisory_coef: -0.6
  regime_currency_coef: -0.8
  regime_news_sentiment_coef: -0.3
  seasonal_index:
    jan: 0.16
    feb: 0.13
    # ...
  trained_on_window: ["2024-05", "2026-05"]
  sample_size: 247
```

Top 10 source markets per cluster covers ~85% of bookings. The rest aggregate to "other."

Refresh policy:
- `share_of_bookings` and `seasonal_index`: weekly online update
- All other coefficients: full retrain quarterly
- Reassignment of properties to clusters: quarterly with manual review for borderline cases

---

## Source-market modifier computation

```python
def compute_property_demand_modifier(property_id, target_date):
    mix = source_market_get_mix(property_id, trailing_days=90)
    cluster = get_cluster_for_property(property_id)
    regime = regime_classify(property.city, target_date)

    weighted_modifier = 0.0
    breakdown = []
    for segment in mix.top_segments:
        profile = get_segment_profile(cluster, segment.country)
        regime_segment = regime.per_source_market[segment.country]

        # Adjust regime modifier by segment's specific sensitivity
        adjusted = apply_segment_sensitivity(
            regime_segment.modifier, profile, regime
        )

        contribution = segment.share * adjusted
        weighted_modifier += contribution
        breakdown.append({
            "country": segment.country,
            "share": segment.share,
            "regime_modifier": regime_segment.modifier,
            "adjusted": adjusted,
            "contribution": contribution
        })

    return {
        "modifier": weighted_modifier,
        "breakdown": breakdown,
        "notes": derive_notes(breakdown)
    }
```

This is what feeds `source_market_demand_modifier` into the elasticity model and into Market Research's narrative.

---

## Validation

Before any model is wired into PriceGuard:

```
1. Backtest on 24mo Hostaway data:
   - Per cluster, compute counterfactual RevPAR delta if PriceGuard used 
     the new model
   - Calibration plot: predicted P(book) deciles vs realized P(book)
   - MAE on regime score against labeled holdout (last 3 months)

2. Ship gates:
   - Layer 1 RevPAR delta median +5% per cluster, p25 ≥0%
   - Layer 2 calibration error <10pp across deciles
   - Layer 3 hard_block rate <2%, override_rate (after 60d) <15%

3. Cluster-by-cluster promotion. Don't ship all 30 properties.
```

See `06-backtest-harness.md` for harness mechanics and ship-criteria detail.

---

## Tooling

- Bayesian models: PyMC 5 or NumPyro (NumPyro is faster on GPU)
- Regression: LightGBM 4
- Feature engineering: pandas, polars (polars for the 24mo backtest dataset)
- Notebooks for training: Jupyter, hosted on Modal or Colab Pro
- Production serving: FastAPI loads pickled posteriors, serves predictions in <50ms

## Refresh schedule

```
Daily (06:00 UTC):
  - Regime classifier batch (all cities)
  - Comp set scrape (all properties)
  - Source-market mix recompute (rolling 90d)

Daily (02:00 UTC):
  - Elasticity online update (Bayesian conjugate)
  - Posterior drift logging

Weekly (Mondays 03:00 UTC):
  - Full elasticity resample (all properties)
  - Segment profile share/seasonal refresh

Monthly:
  - Cluster reassignment review (manual + automated)

Quarterly:
  - Full segment profile retrain
  - Strategy memo refresh per property (RM-led)
```
