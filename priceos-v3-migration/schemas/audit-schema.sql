-- PriceOS v3 — Audit, Snapshots, and Outcomes
-- Build in week 1. Foundation for everything else.

-- =============================================================
-- agent_decisions: every Lyzr agent invocation
-- =============================================================
CREATE TABLE agent_decisions (
  decision_id        UUID PRIMARY KEY,
  parent_decision_id UUID REFERENCES agent_decisions(decision_id),
  property_id        UUID NOT NULL,
  ts                 TIMESTAMPTZ NOT NULL,
  agent_name         TEXT NOT NULL,           -- 'aria', 'priceguard', etc
  agent_version      TEXT NOT NULL,           -- semver per agent prompt
  prompt_hash        TEXT NOT NULL,           -- sha256 of system prompt
  model              TEXT NOT NULL,           -- 'claude-sonnet-4.6' etc
  temperature        REAL NOT NULL,
  inputs             JSONB NOT NULL,          -- snapshot at decision time
  outputs            JSONB NOT NULL,          -- schema-validated structured output
  tool_calls         JSONB,                   -- [{tool, args, response, duration_ms}]
  duration_ms        INT,
  error              TEXT,
  trigger            TEXT NOT NULL,           -- 'live' | 'backtest' | 'replay' | 'shadow'
  replay_of          UUID REFERENCES agent_decisions(decision_id),
  override_set       JSONB,                   -- what was overridden vs original
  snapshot_id        UUID REFERENCES state_snapshots(snapshot_id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decisions_property_ts ON agent_decisions(property_id, ts DESC);
CREATE INDEX idx_decisions_parent ON agent_decisions(parent_decision_id);
CREATE INDEX idx_decisions_replay ON agent_decisions(replay_of);
CREATE INDEX idx_decisions_trigger ON agent_decisions(trigger);
CREATE INDEX idx_decisions_agent ON agent_decisions(agent_name, ts DESC);

-- =============================================================
-- state_snapshots: reconstructable input state at decision time
-- =============================================================
CREATE TABLE state_snapshots (
  snapshot_id        UUID PRIMARY KEY,
  property_id        UUID NOT NULL,
  ts                 TIMESTAMPTZ NOT NULL,
  calendar           JSONB NOT NULL,          -- 365-night calendar state
  reservations       JSONB NOT NULL,          -- on-the-books reservations
  comp_set           JSONB NOT NULL,          -- 15 comps with price+availability
  events             JSONB,                   -- events in window with verification status
  news               JSONB,                   -- news with source URL + trust score
  market_context     JSONB,                   -- regime score, currency, weekend def
  guardrails         JSONB,                   -- active owner guardrails
  source_market_mix  JSONB,                   -- guest country mix trailing 90d
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_property_ts ON state_snapshots(property_id, ts DESC);

-- =============================================================
-- decision_outcomes: what actually happened (lagging fill)
-- =============================================================
CREATE TABLE decision_outcomes (
  decision_id     UUID PRIMARY KEY REFERENCES agent_decisions(decision_id),
  target_date     DATE NOT NULL,              -- the night this decision priced
  outcome_type    TEXT NOT NULL,              -- 'booked' | 'unbooked' | 'cancelled' | 'overridden'
  realized_price  NUMERIC,
  realized_at     TIMESTAMPTZ,
  channel         TEXT,
  los_nights      INT,
  guest_country   TEXT,
  observed_revpar NUMERIC,
  override_reason TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outcomes_target_date ON decision_outcomes(target_date);
CREATE INDEX idx_outcomes_type ON decision_outcomes(outcome_type);

-- =============================================================
-- elasticity_posteriors: per-property model state
-- =============================================================
CREATE TABLE elasticity_posteriors (
  property_id     UUID PRIMARY KEY,
  cluster_id      TEXT NOT NULL,
  posterior_params JSONB NOT NULL,            -- mean + cov of beta coefficients
  sample_size     INT NOT NULL,
  last_updated    TIMESTAMPTZ NOT NULL,
  trained_window  TSTZRANGE NOT NULL
);

-- =============================================================
-- regime_states: daily regime classifier outputs
-- =============================================================
CREATE TABLE regime_states (
  city            TEXT NOT NULL,
  as_of_date      DATE NOT NULL,
  regime_score    REAL NOT NULL,
  regime_label    TEXT NOT NULL,
  trend           TEXT NOT NULL,              -- 'rising' | 'stable' | 'falling'
  confidence      REAL NOT NULL,
  per_source_market JSONB NOT NULL,
  feature_contributions JSONB NOT NULL,
  data_freshness  JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (city, as_of_date)
);

-- =============================================================
-- clusters: cluster definitions
-- =============================================================
CREATE TABLE clusters (
  cluster_id      TEXT PRIMARY KEY,
  description     TEXT,
  rule_definition JSONB,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE property_cluster_assignments (
  property_id     UUID NOT NULL,
  cluster_id      TEXT NOT NULL REFERENCES clusters(cluster_id),
  assigned_at     TIMESTAMPTZ NOT NULL,
  unassigned_at   TIMESTAMPTZ,
  reason          TEXT,
  PRIMARY KEY (property_id, assigned_at)
);

-- =============================================================
-- segment_profiles: cluster x source-market profiles
-- =============================================================
CREATE TABLE segment_profiles (
  cluster_id              TEXT NOT NULL REFERENCES clusters(cluster_id),
  country_code            TEXT NOT NULL,
  share_of_bookings       REAL,
  lead_time_p25           REAL,
  lead_time_p50           REAL,
  lead_time_p75           REAL,
  los_p25                 REAL,
  los_p50                 REAL,
  los_p75                 REAL,
  channel_preference      JSONB,
  weekend_premium_coef    REAL,
  weekday_softness_coef   REAL,
  price_elasticity        REAL,
  regime_advisory_coef    REAL,
  regime_currency_coef    REAL,
  regime_news_sentiment_coef REAL,
  seasonal_index          JSONB,
  trained_on_window       TSTZRANGE,
  trained_at              TIMESTAMPTZ,
  sample_size             INT,
  confidence              REAL,
  PRIMARY KEY (cluster_id, country_code)
);

-- =============================================================
-- comp_sets: per-property hand-picked comp listings
-- =============================================================
CREATE TABLE comp_sets (
  property_id     UUID NOT NULL,
  comp_id         UUID NOT NULL,
  source          TEXT NOT NULL,              -- 'airbnb' | 'booking' | 'vrbo'
  source_listing_id TEXT NOT NULL,
  similarity_score REAL,
  selected_by     TEXT NOT NULL,              -- 'human' | 'agent_suggested'
  selected_at     TIMESTAMPTZ NOT NULL,
  retired_at      TIMESTAMPTZ,
  PRIMARY KEY (property_id, comp_id)
);

CREATE INDEX idx_comp_sets_property ON comp_sets(property_id) WHERE retired_at IS NULL;

-- =============================================================
-- comp_observations: time-series of comp prices/availability
-- =============================================================
CREATE TABLE comp_observations (
  comp_id         UUID NOT NULL,
  observation_ts  TIMESTAMPTZ NOT NULL,
  target_date     DATE NOT NULL,
  price           NUMERIC,
  available       BOOLEAN,
  min_stay        INT,
  raw_payload_url TEXT,                       -- S3 URL of raw scrape
  PRIMARY KEY (comp_id, observation_ts, target_date)
);

CREATE INDEX idx_comp_obs_target ON comp_observations(target_date, observation_ts DESC);

-- =============================================================
-- events_validated: events with confidence + verification
-- =============================================================
CREATE TABLE events_validated (
  event_id        UUID PRIMARY KEY,
  city            TEXT NOT NULL,
  name            TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  category        TEXT,                       -- 'mega' | 'major' | 'minor' | 'concert'
  expected_premium_low REAL,
  expected_premium_high REAL,
  source_urls     TEXT[],
  confidence      REAL NOT NULL,
  verification_status TEXT NOT NULL,          -- 'auto' | 'human_approved' | 'rejected'
  verified_by     TEXT,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_city_date ON events_validated(city, start_date);
CREATE INDEX idx_events_verified ON events_validated(verification_status);

-- =============================================================
-- rm_actions: human RM corrections (training labels)
-- =============================================================
CREATE TABLE rm_actions (
  action_id       UUID PRIMARY KEY,
  rm_id           UUID NOT NULL,
  decision_id     UUID NOT NULL REFERENCES agent_decisions(decision_id),
  action          TEXT NOT NULL,              -- 'approve' | 'modify' | 'reject' | 'override' | 'escalate_to_owner'
  modified_price  NUMERIC,
  modified_min_stay INT,
  rationale       TEXT,
  ts              TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rm_actions_rm ON rm_actions(rm_id, ts DESC);
CREATE INDEX idx_rm_actions_decision ON rm_actions(decision_id);

-- =============================================================
-- evaluation_runs: nightly backtest scorecards
-- =============================================================
CREATE TABLE evaluation_runs (
  run_id            UUID PRIMARY KEY,
  run_at            TIMESTAMPTZ NOT NULL,
  prompts_hash      TEXT NOT NULL,
  constants_hash    TEXT NOT NULL,
  layer_1_metrics   JSONB NOT NULL,           -- per-cluster RevPAR delta etc
  layer_2_metrics   JSONB NOT NULL,           -- calibration error
  layer_3_metrics   JSONB NOT NULL,           -- operational metrics
  ship_status       TEXT NOT NULL,            -- 'READY' | 'WATCH' | 'BLOCKED'
  regressions       JSONB,
  improvements      JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- guest_signal_aggregates: rolling guest sentiment per property
-- =============================================================
CREATE TABLE guest_signal_aggregates (
  property_id     UUID NOT NULL,
  window_end      DATE NOT NULL,
  window_days     INT NOT NULL,
  sentiment_score REAL,                       -- -1 to 1
  recurring_themes JSONB,
  complaint_categories JSONB,                 -- {cleanliness: 0.12, noise: 0.04, ...}
  positive_themes  JSONB,
  thread_count    INT,
  computed_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (property_id, window_end, window_days)
);

CREATE INDEX idx_guest_signals_property ON guest_signal_aggregates(property_id, window_end DESC);

-- =============================================================
-- maintenance: regular ANALYZE and partition rotation policies
-- =============================================================
-- Recommend partitioning agent_decisions and comp_observations by month
-- after volume exceeds 10M rows. TimescaleDB hypertables work well here.
