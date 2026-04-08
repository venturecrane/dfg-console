/**
 * dfg-scout migration validation via @venturecrane/crane-test-harness.
 *
 * Asserts that schema.sql + numbered migrations apply cleanly and
 * produce the schema dfg-scout handlers depend on.
 *
 * Notes:
 *  - dfg-scout's `schema.sql` is the consolidated current-state schema and
 *    already reflects every column/table added by the numbered historical
 *    migrations (001-008). Applying schema.sql AND the numbered files to a
 *    fresh DB fails with "duplicate column name" because the numbered files
 *    are one-time migrations for environments bootstrapped pre-schema.
 *    For fresh-DB validation we therefore apply schema.sql alone, matching
 *    how a brand new environment is provisioned.
 *  - discoverNumericMigrations is still exercised against a custom 3-digit
 *    dash pattern so the ordering contract is covered.
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createTestD1,
	runMigrations,
	discoverNumericMigrations,
} from '@venturecrane/crane-test-harness';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', '..', 'migrations');

// 3-digit prefix, dash, name, .sql. Excludes seed/reset/utility files.
const MIGRATION_PATTERN = /^\d{3}-[A-Za-z0-9-]+\.sql$/;

describe('dfg-scout migrations via harness', () => {
	it('discovers schema.sql first then numbered migrations in order', () => {
		const files = discoverNumericMigrations(migrationsDir, { pattern: MIGRATION_PATTERN });
		expect(files[0]).toMatch(/schema\.sql$/);

		const numbered = files.slice(1).map((f) => f.split('/').pop()!);
		const numbers = numbered.map((n) => Number(n.slice(0, 3)));
		for (let i = 1; i < numbers.length; i++) {
			expect(numbers[i]).toBeGreaterThan(numbers[i - 1]!);
		}
		expect(numbers[0]).toBe(1);
	});

	it('applies schema.sql to a fresh DB and produces handler tables', async () => {
		const db = createTestD1();
		const files = discoverNumericMigrations(migrationsDir, { pattern: MIGRATION_PATTERN });
		const schemaOnly = files.filter((f) => f.endsWith('schema.sql'));
		expect(schemaOnly).toHaveLength(1);
		await runMigrations(db, { files: schemaOnly });

		const result = await db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all<{ name: string }>();
		const tables = result.results.map((r) => r.name);

		// Tables the dfg-scout worker source reads from or writes to.
		const expected = [
			'listings', // schema.sql
			'scout_runs', // schema.sql
			'analyses', // 005
			'category_defs', // schema.sql / 007
		];
		for (const t of expected) {
			expect(tables, `expected table ${t} to exist post-migration`).toContain(t);
		}
	});
});
