/**
 * Integration test for Drizzle transaction safety with pooled connections.
 *
 * Validates that:
 * - Standalone mutations (db.insert, db.update, db.delete) work through the
 *   resilient proxy without ERR_POSTGRES_UNSAFE_TRANSACTION
 * - db.transaction() works (no double-wrapping)
 * - Concurrent mutations through Drizzle work correctly
 *
 * Run:
 *   DATABASE_URL=postgres://... bun run packages/drizzle/test/integration/tx-safety.ts
 *
 * See: https://github.com/agentuity/sdk/issues/911
 */

import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createPostgresDrizzle } from '../../src/postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('❌ Missing DATABASE_URL env var.');
	console.error('   Usage: DATABASE_URL=postgres://user:pass@host:5432/db bun run this-file.ts');
	process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────
// Schema (matches the test table)
// ───────────────────────────────────────────────────────────────────────

const TEST_TABLE = 'drizzle_tx_safety_test';

const items = pgTable(TEST_TABLE, {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	value: text('value'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Mimics the better-auth verification table from the original error report
const verification = pgTable('drizzle_tx_verification_test', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }),
	updatedAt: timestamp('updatedAt', { withTimezone: true }),
});

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
			console.error(`     cause: ${(error.cause as Error).message ?? error.cause}`);
		}
	}
}

// ───────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ───────────────────────────────────────────────────────────────────────

async function setup(rawSql: InstanceType<typeof SQL>) {
	await rawSql.unsafe(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
	await rawSql.unsafe('DROP TABLE IF EXISTS drizzle_tx_verification_test');
	await rawSql.unsafe(`
		CREATE TABLE ${TEST_TABLE} (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			value TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`);
	await rawSql.unsafe(`
		CREATE TABLE drizzle_tx_verification_test (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			"expiresAt" TIMESTAMPTZ NOT NULL,
			"createdAt" TIMESTAMPTZ,
			"updatedAt" TIMESTAMPTZ
		)
	`);
}

async function teardown(rawSql: InstanceType<typeof SQL>) {
	await rawSql.unsafe(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
	await rawSql.unsafe('DROP TABLE IF EXISTS drizzle_tx_verification_test');
}

// ───────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────

async function testDrizzle() {
	console.log('\n📦 Drizzle ORM with resilient proxy');

	const { db, client, close } = createPostgresDrizzle({
		url: DATABASE_URL,
		schema: { items, verification },
		driver: 'bun-sql',
	});

	await client.waitForConnection();

	try {
		await setup(client.raw);

		// ── Standalone mutations (go through proxy's unsafe() handler) ──

		await test('db.insert() — standalone INSERT works', async () => {
			const result = await db
				.insert(items)
				.values({ name: 'drizzle-insert', value: 'hello' })
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].name !== 'drizzle-insert') {
				throw new Error(`Expected 'drizzle-insert', got '${result[0].name}'`);
			}
		});

		await test('db.insert() — reproduces the original better-auth verification scenario', async () => {
			// This is the exact scenario from the bug report
			const now = new Date();
			const expires = new Date(Date.now() + 10 * 60 * 1000);
			const result = await db
				.insert(verification)
				.values({
					id: 'test-verification-id',
					identifier: 'test-identifier',
					value: JSON.stringify({
						callbackURL: '/',
						codeVerifier: 'test-code-verifier-string',
						expiresAt: expires.getTime(),
					}),
					expiresAt: expires,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].id !== 'test-verification-id') {
				throw new Error(`Expected id 'test-verification-id', got '${result[0].id}'`);
			}
		});

		await test('db.update() — standalone UPDATE works', async () => {
			const result = await db
				.update(items)
				.set({ value: 'updated' })
				.where(eq(items.name, 'drizzle-insert'))
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].value !== 'updated') {
				throw new Error(`Expected 'updated', got '${result[0].value}'`);
			}
		});

		await test('db.delete() — standalone DELETE works', async () => {
			// Insert a row to delete
			await db.insert(items).values({ name: 'to-delete', value: 'x' });
			const result = await db.delete(items).where(eq(items.name, 'to-delete')).returning();
			if (result.length !== 1) throw new Error(`Expected 1 deleted row, got ${result.length}`);
		});

		await test('db.select() — standalone SELECT works', async () => {
			const result = await db.select().from(items);
			// Should have at least the drizzle-insert row
			if (result.length === 0) throw new Error('Expected at least 1 row');
		});

		// ── Explicit transactions (go through proxy.begin → Bun's sql.begin) ──

		await test('db.transaction() — single INSERT works (no double-wrapping)', async () => {
			const result = await db.transaction(async (tx) => {
				return tx.insert(items).values({ name: 'tx-insert', value: 'in-tx' }).returning();
			});
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].name !== 'tx-insert') {
				throw new Error(`Expected 'tx-insert', got '${result[0].name}'`);
			}
		});

		await test('db.transaction() — multiple operations work', async () => {
			const [inserted, updated] = await db.transaction(async (tx) => {
				const ins = await tx
					.insert(items)
					.values({ name: 'tx-multi', value: 'original' })
					.returning();
				const upd = await tx
					.update(items)
					.set({ value: 'modified' })
					.where(eq(items.name, 'tx-multi'))
					.returning();
				return [ins, upd];
			});
			if (inserted.length !== 1) throw new Error('Expected 1 inserted row');
			if (updated.length !== 1) throw new Error('Expected 1 updated row');
			if (updated[0].value !== 'modified') throw new Error('Expected value to be modified');
		});

		await test('db.transaction() — auto-rollback on error', async () => {
			const countBefore = await db.select().from(items);
			try {
				await db.transaction(async (tx) => {
					await tx.insert(items).values({ name: 'should-rollback', value: 'x' });
					throw new Error('intentional error');
				});
			} catch {
				// expected
			}
			const countAfter = await db.select().from(items);
			if (countBefore.length !== countAfter.length) {
				throw new Error('Row was not rolled back');
			}
		});

		await test('db.transaction() — INSERT into verification table (exact bug report scenario)', async () => {
			const now = new Date();
			const expires = new Date(Date.now() + 10 * 60 * 1000);
			const result = await db.transaction(async (tx) => {
				return tx
					.insert(verification)
					.values({
						id: 'tx-verification-id',
						identifier: 'tx-identifier',
						value: JSON.stringify({
							callbackURL: '/',
							codeVerifier: 'test-code-verifier',
							expiresAt: expires.getTime(),
						}),
						expiresAt: expires,
						createdAt: now,
						updatedAt: now,
					})
					.returning();
			});
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
		});

		// ── Concurrency ──

		await test('concurrent standalone INSERTs work', async () => {
			const inserts = Array.from({ length: 10 }, (_, i) =>
				db
					.insert(items)
					.values({ name: `concurrent-${i}`, value: `v${i}` })
					.returning()
			);
			const results = await Promise.all(inserts);
			for (let i = 0; i < results.length; i++) {
				if (results[i].length !== 1) {
					throw new Error(`Insert ${i}: expected 1 row, got ${results[i].length}`);
				}
			}
		});

		await test('concurrent transactions work', async () => {
			const txns = Array.from({ length: 5 }, (_, i) =>
				db.transaction(async (tx) => {
					return tx
						.insert(items)
						.values({ name: `concurrent-tx-${i}`, value: `tv${i}` })
						.returning();
				})
			);
			const results = await Promise.all(txns);
			for (let i = 0; i < results.length; i++) {
				if (results[i].length !== 1) {
					throw new Error(`Tx ${i}: expected 1 row, got ${results[i].length}`);
				}
			}
		});

		await teardown(client.raw);
	} finally {
		await close();
	}
}

// ───────────────────────────────────────────────────────────────────────
// Run
// ───────────────────────────────────────────────────────────────────────

async function main() {
	console.log('🔬 Drizzle Transaction Safety Integration Tests');
	console.log(`   Database: ${DATABASE_URL?.replace(/\/\/.*@/, '//***@')}`);

	await testDrizzle();

	console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
