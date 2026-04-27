-- 0009_create_operator_config.sql
--
-- Captures the operator_config table that exists in prod but was never tracked
-- by a migration. Discovered during dev-readiness pass — see issue #306.
--
-- Holds per-operator configuration (home location, profit thresholds, distance
-- limits) keyed by (user_id, key). Currently 7 keys are populated in prod for
-- one operator: home_lat, home_lon, home_location, max_acquisition_dollars,
-- max_distance_miles, min_margin_percent, min_profit_dollars.
--
-- Worker source does not currently read these values — the UI/feature that
-- consumed them was either removed or not yet built. The values are preserved
-- so a future dev session can wire them into the analyst's profit-evaluation
-- flow.
--
-- IF NOT EXISTS so the migration is idempotent when applied to environments
-- where the table already exists (i.e., prod).

CREATE TABLE IF NOT EXISTS operator_config (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
