/**
 * Integration test for the node-postgres (pg) path used by createAuth({ connectionString }).
 *
 * This validates the fix for GitHub issue #1030, which uses:
 *
 *   createPostgresDrizzle({ connectionString, driver: 'pg' })
 *
 * instead of Bun's native SQL driver to avoid parameter binding failures in
 * prepared statements with multiple parameters — specifically Better Auth's
 * verification table INSERT which sends 6 parameters.
 *
 * This test exercises that exact scenario through createPostgresDrizzle with
 * the 'pg' driver to prove the path works correctly with multi-parameter queries.
 *
 * Run:
 *   DATABASE_URL=postgres://user:pass@host:5432/db bun run packages/auth/test/integration/pg-connectionstring.ts
 *
 * See: https://github.com/agentuity/sdk/issues/1030
 */

import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createPostgresDrizzle } from '@agentuity/drizzle';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('❌ Missing DATABASE_URL env var.');
	console.error(
		'   Usage: DATABASE_URL=postgres://user:pass@host:5432/db bun run packages/auth/test/integration/pg-connectionstring.ts'
	);
	process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────
// Schema
// ───────────────────────────────────────────────────────────────────────

const ITEMS_TABLE = 'auth_pg_test_items';
const VERIFICATION_TABLE = 'auth_pg_verification_test';

const items = pgTable(ITEMS_TABLE, {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	value: text('value'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Mimics the Better Auth verification table — the exact table that caused #1030.
// INSERT into this table sends 6 parameters which triggered the parameter binding bug.
const verification = pgTable(VERIFICATION_TABLE, {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }),
	updatedAt: timestamp('updatedAt', { withTimezone: true }),
});

// ───────────────────────────────────────────────────────────────────────
// Test harness
// ───────────────────────────────────────────────────────────────────────

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
// Setup / Teardown (uses drizzle's sql tag for DDL — no direct pg dependency needed)
// ───────────────────────────────────────────────────────────────────────

async function setup(db: NodePgDatabase) {
	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${ITEMS_TABLE}`));
	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${VERIFICATION_TABLE}`));
	await db.execute(
		sql.raw(`
		CREATE TABLE ${ITEMS_TABLE} (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			value TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	);
	await db.execute(
		sql.raw(`
		CREATE TABLE ${VERIFICATION_TABLE} (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			"expiresAt" TIMESTAMPTZ NOT NULL,
			"createdAt" TIMESTAMPTZ,
			"updatedAt" TIMESTAMPTZ
		)
	`)
	);
}

async function teardown(db: NodePgDatabase) {
	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${ITEMS_TABLE}`));
	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${VERIFICATION_TABLE}`));
}

// ───────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────

async function testPgDrizzle() {
	console.log(
		'\n📦 createPostgresDrizzle({ driver: "pg" }) — the createAuth({ connectionString }) path'
	);

	// This is the EXACT pattern from the fix in packages/auth/src/agentuity/config.ts:
	//   const { db } = createPostgresDrizzle({ connectionString, driver: 'pg' });
	const { db, close } = createPostgresDrizzle({
		connectionString: DATABASE_URL!,
		driver: 'pg',
	});

	// Verify the adapter chain works — this is how Better Auth consumes the db instance
	const adapter = drizzleAdapter(db, { provider: 'pg' });
	if (!adapter) {
		throw new Error('drizzleAdapter returned falsy — adapter chain is broken');
	}
	console.log('  ℹ️  drizzleAdapter(db, { provider: "pg" }) created successfully');

	try {
		await setup(db);

		// ── Standalone mutations ──

		await test('standalone INSERT into verification table with 6 parameters (exact #1030 bug scenario)', async () => {
			// This is the EXACT scenario from the bug report:
			// Better Auth inserts into the verification table with 6 bound parameters.
			// With Bun.SQL this failed; with node-postgres it must succeed.
			const now = new Date();
			const expires = new Date(Date.now() + 10 * 60 * 1000);
			const result = await db
				.insert(verification)
				.values({
					id: 'verification-standalone-1',
					identifier: 'email-verification@test.com',
					value: JSON.stringify({
						callbackURL: '/',
						codeVerifier: 'abc123-code-verifier-string',
						expiresAt: expires.getTime(),
					}),
					expiresAt: expires,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].id !== 'verification-standalone-1') {
				throw new Error(`Expected id 'verification-standalone-1', got '${result[0].id}'`);
			}
			if (result[0].identifier !== 'email-verification@test.com') {
				throw new Error(`Identifier mismatch: '${result[0].identifier}'`);
			}
		});

		await test('standalone INSERT into items table', async () => {
			const result = await db
				.insert(items)
				.values({ name: 'pg-insert', value: 'hello-from-node-postgres' })
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].name !== 'pg-insert') {
				throw new Error(`Expected 'pg-insert', got '${result[0].name}'`);
			}
		});

		await test('standalone SELECT from items table', async () => {
			const result = await db.select().from(items);
			if (result.length === 0) throw new Error('Expected at least 1 row');
			const found = result.find((r) => r.name === 'pg-insert');
			if (!found) throw new Error("Could not find row with name 'pg-insert'");
		});

		await test('standalone UPDATE on items table', async () => {
			const result = await db
				.update(items)
				.set({ value: 'updated-via-pg' })
				.where(eq(items.name, 'pg-insert'))
				.returning();
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].value !== 'updated-via-pg') {
				throw new Error(`Expected 'updated-via-pg', got '${result[0].value}'`);
			}
		});

		await test('standalone DELETE from items table', async () => {
			// Insert a row to delete
			await db.insert(items).values({ name: 'to-delete-pg', value: 'ephemeral' });
			const result = await db.delete(items).where(eq(items.name, 'to-delete-pg')).returning();
			if (result.length !== 1) throw new Error(`Expected 1 deleted row, got ${result.length}`);
		});

		// ── Explicit transactions ──

		await test('transaction INSERT into verification table with 6 parameters', async () => {
			const now = new Date();
			const expires = new Date(Date.now() + 10 * 60 * 1000);
			const result = await db.transaction(async (tx) => {
				return tx
					.insert(verification)
					.values({
						id: 'verification-tx-1',
						identifier: 'tx-email@test.com',
						value: JSON.stringify({
							callbackURL: '/callback',
							codeVerifier: 'tx-code-verifier',
							expiresAt: expires.getTime(),
						}),
						expiresAt: expires,
						createdAt: now,
						updatedAt: now,
					})
					.returning();
			});
			if (result.length !== 1) throw new Error(`Expected 1 row, got ${result.length}`);
			if (result[0].id !== 'verification-tx-1') {
				throw new Error(`Expected id 'verification-tx-1', got '${result[0].id}'`);
			}
		});

		await test('transaction with multiple operations (insert + update)', async () => {
			const [inserted, updated] = await db.transaction(async (tx) => {
				const ins = await tx
					.insert(items)
					.values({ name: 'tx-multi-pg', value: 'original' })
					.returning();
				const upd = await tx
					.update(items)
					.set({ value: 'modified-in-tx' })
					.where(eq(items.name, 'tx-multi-pg'))
					.returning();
				return [ins, upd];
			});
			if (inserted.length !== 1) throw new Error('Expected 1 inserted row');
			if (updated.length !== 1) throw new Error('Expected 1 updated row');
			if (updated[0].value !== 'modified-in-tx') {
				throw new Error(`Expected 'modified-in-tx', got '${updated[0].value}'`);
			}
		});

		// ── Concurrency ──

		await test('concurrent standalone INSERTs (10 parallel)', async () => {
			const inserts = Array.from({ length: 10 }, (_, i) =>
				db
					.insert(items)
					.values({ name: `concurrent-pg-${i}`, value: `v${i}` })
					.returning()
			);
			const results = await Promise.all(inserts);
			for (let i = 0; i < results.length; i++) {
				if (results[i].length !== 1) {
					throw new Error(`Insert ${i}: expected 1 row, got ${results[i].length}`);
				}
			}
		});

		await test('concurrent transactions (5 parallel)', async () => {
			const txns = Array.from({ length: 5 }, (_, i) =>
				db.transaction(async (tx) => {
					return tx
						.insert(items)
						.values({ name: `concurrent-tx-pg-${i}`, value: `tv${i}` })
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

		await teardown(db);
	} catch (err) {
		// Attempt cleanup even on failure
		try {
			await teardown(db);
		} catch {
			// ignore cleanup errors
		}
		throw err;
	} finally {
		await close();
	}
}

// ───────────────────────────────────────────────────────────────────────
// Run
// ───────────────────────────────────────────────────────────────────────

async function main() {
	console.log('🔬 createPostgresDrizzle({ driver: "pg" }) Integration Test (issue #1030)');
	console.log(`   Database: ${DATABASE_URL?.replace(/\/\/.*@/, '//***@')}`);

	await testPgDrizzle();

	console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
