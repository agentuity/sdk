/**
 * Integration test for transaction safety with pooled connections.
 *
 * Validates that:
 * - Standalone mutations work (wrapped in sql.begin internally)
 * - Mutations inside explicit transactions work (no double-wrapping)
 * - Concurrent standalone mutations don't conflict
 * - Raw Bun SQL sql.begin() works as baseline
 *
 * Run:
 *   DATABASE_URL=postgres://... bun run packages/postgres/test/integration/tx-safety.ts
 *
 * See: https://github.com/agentuity/sdk/issues/911
 */

import { SQL } from 'bun';
import { postgres } from '../../src/index';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('❌ Missing DATABASE_URL env var.');
	console.error('   Usage: DATABASE_URL=postgres://user:pass@host:5432/db bun run this-file.ts');
	process.exit(1);
}

const TEST_TABLE = 'tx_safety_test';
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		passed++;
		console.log(`  ✅ ${name}`);
	} catch (error) {
		failed++;
		console.error(`  ❌ ${name}`);
		console.error(`     ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error && error.cause) {
			console.error(`     cause: ${error.cause}`);
		}
	}
}

// ───────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ───────────────────────────────────────────────────────────────────────

async function setup(sql: InstanceType<typeof SQL>) {
	await sql.unsafe(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
	await sql.unsafe(`
		CREATE TABLE ${TEST_TABLE} (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			value TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`);
}

async function teardown(sql: InstanceType<typeof SQL>) {
	await sql.unsafe(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
}

// ───────────────────────────────────────────────────────────────────────
// Part 1: Raw Bun SQL (baseline — proves sql.begin works)
// ───────────────────────────────────────────────────────────────────────

async function testBunSql() {
	console.log('\n📦 Part 1: Raw Bun SQL (baseline)');

	const sql = new SQL({ url: DATABASE_URL, adapter: 'postgres', prepare: false });

	try {
		await setup(sql);

		await test('SELECT works', async () => {
			const rows = await sql.unsafe('SELECT 1 AS one');
			if (rows[0].one !== 1) throw new Error(`Expected 1, got ${rows[0].one}`);
		});

		await test('sql.begin() — INSERT inside transaction', async () => {
			const result = await sql.begin(async (tx) => {
				return tx.unsafe(
					`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING *`,
					['bun-tx', 'hello']
				);
			});
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].name !== 'bun-tx')
				throw new Error(`Expected 'bun-tx', got '${result[0].name}'`);
		});

		await test('sql.begin() — multiple operations in one transaction', async () => {
			const [r1, r2] = await sql.begin(async (tx) => {
				const insert1 = await tx.unsafe(
					`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING *`,
					['bun-multi-1', 'a']
				);
				const insert2 = await tx.unsafe(
					`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING *`,
					['bun-multi-2', 'b']
				);
				return [insert1, insert2];
			});
			if (r1.length !== 1 || r2.length !== 1) throw new Error('Expected 1 row each');
		});

		await test('sql.begin() — auto-rollback on error', async () => {
			const countBefore = await sql.unsafe(`SELECT COUNT(*) AS cnt FROM ${TEST_TABLE}`);
			try {
				await sql.begin(async (tx) => {
					await tx.unsafe(`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2)`, [
						'should-rollback',
						'x',
					]);
					throw new Error('intentional error');
				});
			} catch {
				// expected
			}
			const countAfter = await sql.unsafe(`SELECT COUNT(*) AS cnt FROM ${TEST_TABLE}`);
			if (Number(countBefore[0].cnt) !== Number(countAfter[0].cnt)) {
				throw new Error('Row was not rolled back');
			}
		});

		await teardown(sql);
	} finally {
		await sql.close();
	}
}

// ───────────────────────────────────────────────────────────────────────
// Part 2: @agentuity/postgres client
// ───────────────────────────────────────────────────────────────────────

async function testPostgresClient() {
	console.log('\n📦 Part 2: @agentuity/postgres client');

	const client = postgres({ url: DATABASE_URL });
	await client.waitForConnection();

	try {
		await setup(client.raw);

		await test('tagged template SELECT works', async () => {
			const rows = await client`SELECT 1 AS one`;
			if ((rows as { one: number }[])[0].one !== 1) throw new Error('Expected 1');
		});

		await test('tagged template INSERT works (standalone mutation — uses sql.begin internally)', async () => {
			const name = 'client-insert';
			const rows = await client`
				INSERT INTO ${client.raw.unsafe(TEST_TABLE)} (name, value)
				VALUES (${name}, ${'test-val'})
				RETURNING *
			`;
			if ((rows as { name: string }[]).length !== 1) throw new Error('Expected 1 row');
		});

		await test('unsafeQuery INSERT works (standalone mutation)', async () => {
			const result = await client.unsafeQuery(
				`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING *`,
				['unsafe-insert', 'val']
			);
			if ((result as unknown[]).length !== 1) throw new Error('Expected 1 row');
		});

		await test('unsafeQuery INSERT .values() works', async () => {
			const result = await client
				.unsafeQuery(
					`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING id, name`,
					['unsafe-values', 'val']
				)
				.values();
			if ((result as unknown[][]).length !== 1) throw new Error('Expected 1 row');
			if (!Array.isArray((result as unknown[][])[0]))
				throw new Error('Expected array row format');
		});

		await test('unsafeQuery UPDATE works', async () => {
			const result = await client.unsafeQuery(
				`UPDATE ${TEST_TABLE} SET value = $1 WHERE name = $2 RETURNING *`,
				['updated', 'unsafe-insert']
			);
			if ((result as { value: string }[])[0]?.value !== 'updated') {
				throw new Error('Expected value to be updated');
			}
		});

		await test('unsafeQuery DELETE works', async () => {
			// Insert then delete
			await client.unsafeQuery(`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2)`, [
				'to-delete',
				'x',
			]);
			const result = await client.unsafeQuery(
				`DELETE FROM ${TEST_TABLE} WHERE name = $1 RETURNING *`,
				['to-delete']
			);
			if ((result as unknown[]).length !== 1) throw new Error('Expected 1 deleted row');
		});

		await test('explicit begin/commit transaction works', async () => {
			const tx = await client.begin();
			try {
				await tx.query`INSERT INTO ${client.raw.unsafe(TEST_TABLE)} (name, value) VALUES (${'tx-insert'}, ${'tx-val'})`;
				await tx.commit();
			} catch (e) {
				await tx.rollback();
				throw e;
			}
			const rows = await client.unsafeQuery(`SELECT * FROM ${TEST_TABLE} WHERE name = $1`, [
				'tx-insert',
			]);
			if ((rows as unknown[]).length !== 1) throw new Error('Expected 1 row after commit');
		});

		await test('concurrent standalone mutations work', async () => {
			const inserts = Array.from({ length: 5 }, (_, i) =>
				client.unsafeQuery(
					`INSERT INTO ${TEST_TABLE} (name, value) VALUES ($1, $2) RETURNING *`,
					[`concurrent-${i}`, `val-${i}`]
				)
			);
			const results = await Promise.all(inserts);
			for (const r of results) {
				if ((r as unknown[]).length !== 1) throw new Error('Expected 1 row per insert');
			}
		});

		await test('unsafeQuery SELECT works (no transaction wrapping)', async () => {
			const result = await client.unsafeQuery(`SELECT * FROM ${TEST_TABLE}`);
			if ((result as unknown[]).length === 0) throw new Error('Expected rows');
		});

		await teardown(client.raw);
	} finally {
		await client.close();
	}
}

// ───────────────────────────────────────────────────────────────────────
// Run
// ───────────────────────────────────────────────────────────────────────

async function main() {
	console.log('🔬 Transaction Safety Integration Tests');
	console.log(`   Database: ${DATABASE_URL?.replace(/\/\/.*@/, '//***@')}`);

	await testBunSql();
	await testPostgresClient();

	console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
