# D1 Migrations Runbook

How to run schema migrations against DFG's D1 databases.

## Background

DFG has one shared D1 database with two environments:

| Env        | Binding name (wrangler.toml) | Database name          | UUID                                                  |
| ---------- | ---------------------------- | ---------------------- | ----------------------------------------------------- |
| Local dev  | `DB` (default block)         | `dfg-scout-db-preview` | local SQLite via miniflare; remote UUID may not exist |
| Production | `DB` (env.production block)  | `dfg-scout-db`         | `08c267b8-b252-422a-8381-891d12917b33`                |

Both `dfg-scout` and `dfg-api` workers bind to this database. Each worker keeps its own `migrations/` directory:

- `workers/dfg-scout/migrations/` — scout uses a consolidated `schema.sql` for fresh DBs (the numbered `001-...008-` files are historical and conflict with `schema.sql`; the test harness in `workers/dfg-scout/test/harness/migrations.test.ts` enforces this).
- `workers/dfg-api/migrations/` — eight files `0001_*.sql` through `0008_*.sql`, applied sequentially via `wrangler d1 migrations apply`.

## Local dev

```bash
cd workers/dfg-api
npm run db:migrate:local   # → wrangler d1 migrations apply dfg-scout-db-preview --local
```

Idempotent. Wrangler auto-discovers `migrations/` and tracks applied migrations in a `d1_migrations` table inside the local SQLite store.

For scout's local schema (separate concern):

```bash
cd workers/dfg-scout
npx wrangler d1 execute dfg-scout-db-preview --file=migrations/schema.sql --local
```

## Production migrations

**Production is intentionally NOT wired up to the migrations runner.** `npm run db:migrate` is a deliberate no-op that points readers here. Reason: the existing prod D1 (`dfg-scout-db`, ~22 MB) was bootstrapped by hand or via the legacy `wrangler d1 execute --file=...` approach. It has a `d1_migrations` tracking table, but only 2 of the 9 migration files are recorded as applied (the rest were applied without going through the runner). Running `wrangler d1 migrations apply --remote` today would treat 7 migrations as unapplied and attempt to re-apply them — `CREATE TABLE IF NOT EXISTS` is safe, but `ALTER TABLE ADD COLUMN` statements would fail with "duplicate column" since the columns already exist.

If you need to enable the runner for prod (one-time prep, gated on Captain approval):

1. Verify with `wrangler d1 execute dfg-scout-db --remote --command="SELECT name FROM sqlite_master WHERE type='table'"` that all current-migration tables already exist.
2. Inspect the existing `d1_migrations` rows: `wrangler d1 execute dfg-scout-db --remote --command="SELECT name FROM d1_migrations ORDER BY id"`. Note which migrations are already recorded.
3. Backfill `d1_migrations` with rows for the migrations that physically applied but aren't tracked:
   ```sql
   INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES
     ('0001_opportunities.sql', CURRENT_TIMESTAMP),
     ('0002_drop_alert_dismissals.sql', CURRENT_TIMESTAMP),
     ('0003_analysis_runs.sql', CURRENT_TIMESTAMP),
     ('0004_staleness_columns.sql', CURRENT_TIMESTAMP),
     ('0005_standardize_sierra_source.sql', CURRENT_TIMESTAMP),
     ('0006_mvc_events.sql', CURRENT_TIMESTAMP),
     ('0007_add_ai_analysis_json.sql', CURRENT_TIMESTAMP),
     ('0008_create_waitlist_signups.sql', CURRENT_TIMESTAMP),
     ('0009_create_operator_config.sql', CURRENT_TIMESTAMP);
   ```
4. Update `workers/dfg-api/package.json` `db:migrate` to:
   ```json
   "db:migrate": "wrangler d1 migrations apply dfg-scout-db --remote"
   ```
5. Run `wrangler d1 migrations list dfg-scout-db --remote` and confirm 0 pending migrations.

After that step, future migrations can be added as `0010_*.sql` etc. and applied via `npm run db:migrate`.

## Recreating the dev preview D1

If `dfg-scout-db-preview` doesn't exist remotely (it was deleted and needs recreation — see issue #302):

```bash
# 1. Create the DB
cd workers/dfg-scout
npx wrangler d1 create dfg-scout-db-preview --location=wnam
# Capture the new UUID from output

# 2. Apply scout's consolidated schema (NOT migrations apply)
npx wrangler d1 execute dfg-scout-db-preview --file=migrations/schema.sql --remote

# 3. Apply api's migrations via the runner
cd ../dfg-api
npx wrangler d1 migrations apply dfg-scout-db-preview --remote

# 4. Verify table count matches prod
npx wrangler d1 execute dfg-scout-db-preview --remote \
  --command='SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type="table"'
# Expect ~18 tables.

# 5. Update both wrangler.toml files (dfg-scout, dfg-api) with the new UUID
#    in their default top-level [[d1_databases]] blocks. PR the change.
```

If any step fails: `npx wrangler d1 delete dfg-scout-db-preview --skip-confirmation` and start over. **Do not partially edit wrangler.toml.**

## Why the asymmetry

Scout's `schema.sql` was authored as a consolidated current-state schema; the numbered files (001-008) are historical migrations that pre-date schema.sql. Applying both to a fresh DB causes "duplicate column" errors. The harness validates schema.sql alone is correct.

dfg-api was authored migration-first with no consolidated schema, so its directory is purely sequential numbered files.

Unifying both workers onto a single pattern is dev-session work, not dev-readiness work.
