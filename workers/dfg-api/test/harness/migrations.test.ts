/**
 * dfg-api migration validation via @venturecrane/crane-test-harness.
 *
 * Ensures the numbered migrations in workers/dfg-api/migrations/ apply
 * cleanly to a fresh in-memory D1 shim and produce the schema the
 * worker handlers depend on.
 *
 * Notes:
 *  - dfg-api has no base schema.sql; all tables are created by the
 *    numbered migrations (0001 onward).
 *  - A macOS Finder duplicate "0005_standardize_sierra_source 2.sql"
 *    exists alongside the canonical 0005 file. Applying both would
 *    conflict, so the discovery pattern excludes filenames with a
 *    space (i.e. requires `0001_name.sql` shape).
 */

import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

// Strict pattern: 4-digit prefix, underscore, no spaces in name.
const MIGRATION_PATTERN = /^\d{4}_[A-Za-z0-9_]+\.sql$/

describe('dfg-api migrations via harness', () => {
  it('discovers migrations in numeric order with no duplicates', () => {
    const files = discoverNumericMigrations(migrationsDir, { pattern: MIGRATION_PATTERN })
    const names = files.map((f) => f.split('/').pop()!)

    // Numbers must be strictly increasing.
    const numbers = names.map((n) => Number(n.slice(0, 4)))
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]!)
    }

    // The Finder duplicate "0005_standardize_sierra_source 2.sql" must be
    // excluded so 0005 is not applied twice.
    expect(names).not.toContain('0005_standardize_sierra_source 2.sql')
    expect(names).toContain('0005_standardize_sierra_source.sql')
  })

  it('applies the full migration chain to a fresh DB', async () => {
    const db = createTestD1()
    const files = discoverNumericMigrations(migrationsDir, { pattern: MIGRATION_PATTERN })
    await runMigrations(db, { files })

    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ name: string }>()
    const tables = result.results.map((r) => r.name)

    // Tables the dfg-api worker source reads from or writes to.
    const expected = [
      'sources', // 0001
      'opportunities', // 0001
      'operator_actions', // 0001
      'tuning_events', // 0001
      'analysis_runs', // 0003
      'mvc_events', // 0006
    ]
    for (const t of expected) {
      expect(tables, `expected table ${t} to exist post-migration`).toContain(t)
    }
  })
})
