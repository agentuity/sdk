/**
 * Integration test for SSL/TLS PostgreSQL connections.
 *
 * Validates that connections with `sslmode=require` in the URL work correctly
 * for both Bun's native SQL driver and @agentuity/postgres (PostgresClient + PostgresPool).
 *
 * This script is run by test-postgres.sh which provides:
 *   TEST_SSL_URL   — connection URL with ?sslmode=require
 *   TEST_PLAIN_URL — connection URL without sslmode
 *   TEST_CA_CERT   — (optional) path to the CA certificate for Docker mode
 *
 * In Docker mode (TEST_CA_CERT provided), the CA cert is passed to pg so it
 * can verify the self-signed certificate chain — we still do full TLS
 * verification, just with the test CA trusted.
 *
 * See: https://github.com/agentuity/sdk/issues/921
 */

import { readFileSync } from 'fs';
import { SQL, postgres, PostgresClient, PostgresPool } from '../../src/index';

// ---------------------------------------------------------------------------
// Config from environment (set by test-postgres.sh)
// ---------------------------------------------------------------------------
const SSL_URL = process.env.TEST_SSL_URL;
const PLAIN_URL = process.env.TEST_PLAIN_URL;
const CA_CERT_PATH = process.env.TEST_CA_CERT;

if (!SSL_URL || !PLAIN_URL) {
	console.error('❌ Missing TEST_SSL_URL or TEST_PLAIN_URL env vars.');
	console.error('   Run this via test-postgres.sh, not directly.');
	process.exit(1);
}

const CA_CERT = CA_CERT_PATH ? readFileSync(CA_CERT_PATH, 'utf-8') : undefined;

/**
 * Per-test timeout in ms. If a test hangs (e.g. connection pool exhaustion),
 * it will be killed after this duration instead of blocking the whole run.
 */
const TEST_TIMEOUT_MS = 15_000;

/**
 * SSL config for PostgresPool.
 *
 * pg's ConnectionParameters stomps any `ssl` config when `sslmode` is in the
 * URL, so we strip sslmode from the URL and pass SSL config explicitly.
 *
 * In Docker mode: pass the test CA cert so pg can verify the self-signed chain.
 * In cloud mode: `ssl: true` uses the system CA store for full verification.
 */
const PG_SSL_CONFIG = CA_CERT ? { ca: CA_CERT } : true;

/**
 * For PostgresPool tests: URL with sslmode stripped out.
 * pg internally promotes sslmode=require to verify-full AND stomps the ssl
 * config object, so we must pass SSL config via the ssl option instead.
 */
const PG_URL = (() => {
	try {
		const parsed = new URL(SSL_URL!);
		parsed.searchParams.delete('sslmode');
		return parsed.toString();
	} catch {
		return SSL_URL!;
	}
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
	process.stdout.write(`  ${name} ... `);
	try {
		await Promise.race([
			fn(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Timed out after ${TEST_TIMEOUT_MS}ms`)),
					TEST_TIMEOUT_MS
				)
			),
		]);
		console.log('✅ PASS');
		passed++;
	} catch (err) {
		console.log('❌ FAIL');
		if (err instanceof Error) {
			console.log(`     Error: ${err.message}`);
			if (err.stack) {
				const frames = err.stack.split('\n').slice(1, 4);
				for (const frame of frames) {
					console.log(`     ${frame.trim()}`);
				}
			}
		} else {
			console.log(`     Error: ${err}`);
		}
		failed++;
	}
}

function assert(condition: boolean, message: string) {
	if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Test Suite 1: @agentuity/postgres SQL (patched Bun.SQL)
//
// Tests the patched SQL export which normalizes TLS options by injecting
// sslmode=require into the URL when tls config is set.
//
// Uses max:1 to keep a single connection per test and avoid exhausting
// PostgreSQL's max_connections across the whole run.
// ---------------------------------------------------------------------------
async function testBunSQL() {
	console.log('\n📦 Test Suite 1: @agentuity/postgres SQL (patched Bun.SQL)');
	console.log('─'.repeat(60));

	// Test 1a: Plain URL (no SSL) — baseline
	await test('SQL: plain URL (no SSL) — SELECT 1', async () => {
		const sql = new SQL({ url: PLAIN_URL, adapter: 'postgres', max: 1 });
		try {
			const rows = await sql`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await sql.close();
		}
	});

	// Test 1b: SSL URL with sslmode=require
	await test('SQL: URL with sslmode=require — SELECT 1', async () => {
		const sql = new SQL({ url: SSL_URL, adapter: 'postgres', max: 1 });
		try {
			const rows = await sql`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await sql.close();
		}
	});

	// Test 1c: Explicit TLS config (no sslmode in URL)
	// Patched SQL injects sslmode=require automatically
	await test('SQL: plain URL + tls config (sslmode injected) — SELECT 1', async () => {
		const sql = new SQL({
			url: PLAIN_URL,
			adapter: 'postgres',
			max: 1,
			tls: true,
		});
		try {
			const rows = await sql`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await sql.close();
		}
	});

	// Test 1d: Stripped URL + explicit TLS
	// Patched SQL injects sslmode=require automatically
	await test('SQL: stripped URL + tls config (sslmode injected) — SELECT 1', async () => {
		const url = new URL(SSL_URL!);
		url.searchParams.delete('sslmode');
		const cleanUrl = url.toString();

		const sql = new SQL({
			url: cleanUrl,
			adapter: 'postgres',
			max: 1,
			tls: true,
		});
		try {
			const rows = await sql`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await sql.close();
		}
	});
}

// ---------------------------------------------------------------------------
// Test Suite 2: @agentuity/postgres PostgresClient (Bun.SQL wrapper)
// ---------------------------------------------------------------------------
async function testPostgresClient() {
	console.log('\n📦 Test Suite 2: @agentuity/postgres — PostgresClient');
	console.log('─'.repeat(60));

	// Test 2a: Plain URL — baseline
	await test('PostgresClient: plain URL — SELECT 1', async () => {
		const client = new PostgresClient({ url: PLAIN_URL, max: 1 });
		try {
			await client.waitForConnection(5000);
			const rows = await client.query`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await client.close();
		}
	});

	// Test 2b: SSL URL with sslmode=require
	await test('PostgresClient: URL with sslmode=require — SELECT 1', async () => {
		const client = new PostgresClient({ url: SSL_URL, max: 1 });
		try {
			await client.waitForConnection(5000);
			const rows = await client.query`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await client.close();
		}
	});

	// Test 2c: Plain URL + explicit TLS config
	// PostgresClient injects sslmode=require when tls config is set
	await test('PostgresClient: plain URL + explicit tls config — SELECT 1', async () => {
		const client = new PostgresClient({
			url: PLAIN_URL,
			max: 1,
			tls: { rejectUnauthorized: false },
		});
		try {
			await client.waitForConnection(5000);
			const rows = await client.query`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await client.close();
		}
	});

	// Test 2d: postgres() factory with SSL URL
	await test('postgres() factory: URL with sslmode=require — SELECT 1', async () => {
		const sql = postgres({ url: SSL_URL, max: 1 });
		try {
			await sql.waitForConnection(5000);
			const rows = await sql`SELECT 1 AS val`;
			assert(Array.isArray(rows), 'Expected array result');
			assert((rows as Array<{ val: number }>)[0]?.val === 1, 'Expected val=1');
		} finally {
			await sql.close();
		}
	});

	// Test 2e: CRUD operations with SSL URL
	await test('PostgresClient: sslmode=require — CRUD operations', async () => {
		const client = new PostgresClient({ url: SSL_URL, max: 1 });
		try {
			await client.waitForConnection(5000);

			await client.unsafe('DROP TABLE IF EXISTS ssl_test');
			await client.unsafe(
				'CREATE TABLE ssl_test (id SERIAL PRIMARY KEY, name TEXT NOT NULL, value INT)'
			);

			await client.query`INSERT INTO ssl_test (name, value) VALUES (${'hello'}, ${42})`;
			await client.query`INSERT INTO ssl_test (name, value) VALUES (${'world'}, ${99})`;

			const rows = await client.query`SELECT * FROM ssl_test ORDER BY id`;
			assert(Array.isArray(rows), 'Expected array');
			assert(rows.length === 2, `Expected 2 rows, got ${rows.length}`);
			assert(
				(rows as Array<{ name: string }>)[0]?.name === 'hello',
				'Expected first row name=hello'
			);

			await client.query`UPDATE ssl_test SET value = ${100} WHERE name = ${'hello'}`;
			const updated = await client.query`SELECT value FROM ssl_test WHERE name = ${'hello'}`;
			assert(
				(updated as Array<{ value: number }>)[0]?.value === 100,
				'Expected updated value=100'
			);

			await client.query`DELETE FROM ssl_test WHERE name = ${'world'}`;
			const afterDelete = await client.query`SELECT * FROM ssl_test`;
			assert(
				(afterDelete as Array<unknown>).length === 1,
				`Expected 1 row after delete, got ${(afterDelete as Array<unknown>).length}`
			);

			await client.unsafe('DROP TABLE ssl_test');
		} finally {
			await client.close();
		}
	});

	// Test 2f: Transaction with SSL URL
	await test('PostgresClient: sslmode=require — transaction', async () => {
		const client = new PostgresClient({ url: SSL_URL, max: 1 });
		try {
			await client.waitForConnection(5000);
			await client.unsafe('DROP TABLE IF EXISTS ssl_tx_test');
			await client.unsafe('CREATE TABLE ssl_tx_test (id SERIAL PRIMARY KEY, val TEXT)');

			const tx = await client.begin();
			await tx.query`INSERT INTO ssl_tx_test (val) VALUES (${'a'})`;
			await tx.query`INSERT INTO ssl_tx_test (val) VALUES (${'b'})`;
			await tx.commit();

			const rows = await client.query`SELECT * FROM ssl_tx_test ORDER BY id`;
			assert((rows as Array<unknown>).length === 2, 'Expected 2 rows after commit');

			const tx2 = await client.begin();
			await tx2.query`INSERT INTO ssl_tx_test (val) VALUES (${'c'})`;
			await tx2.rollback();

			const afterRollback = await client.query`SELECT * FROM ssl_tx_test`;
			assert(
				(afterRollback as Array<unknown>).length === 2,
				'Expected still 2 rows after rollback'
			);

			await client.unsafe('DROP TABLE ssl_tx_test');
		} finally {
			await client.close();
		}
	});
}

// ---------------------------------------------------------------------------
// Test Suite 3: @agentuity/postgres PostgresPool (pg driver)
//
// In Docker mode, the CA cert is passed via ssl.ca so pg can verify the
// self-signed certificate chain. In cloud mode, pg uses the system CA store.
// ---------------------------------------------------------------------------
async function testPostgresPool() {
	console.log('\n📦 Test Suite 3: @agentuity/postgres — PostgresPool');
	console.log('─'.repeat(60));

	// Test 3a: Plain URL + explicit SSL — baseline
	await test('PostgresPool: plain URL + explicit ssl — SELECT 1', async () => {
		const pool = new PostgresPool({ connectionString: PG_URL, max: 1, ssl: PG_SSL_CONFIG });
		try {
			await pool.waitForConnection(5000);
			const result = await pool.query('SELECT 1 AS val');
			assert(result.rows.length === 1, 'Expected 1 row');
			assert(result.rows[0]?.val === 1, 'Expected val=1');
		} finally {
			await pool.close();
		}
	});

	// Test 3b: SSL URL with sslmode=require (pg handles sslmode internally)
	await test('PostgresPool: URL with sslmode=require — SELECT 1', async () => {
		// pg promotes sslmode=require → verify-full; against cloud this works
		// (valid certs), against Docker self-signed certs need the CA
		const pool = new PostgresPool({
			connectionString: PG_URL,
			max: 1,
			ssl: PG_SSL_CONFIG,
		});
		try {
			await pool.waitForConnection(5000);
			const result = await pool.query('SELECT 1 AS val');
			assert(result.rows.length === 1, 'Expected 1 row');
			assert(result.rows[0]?.val === 1, 'Expected val=1');
		} finally {
			await pool.close();
		}
	});

	// Test 3c: CRUD operations
	await test('PostgresPool: SSL — CRUD operations', async () => {
		const pool = new PostgresPool({ connectionString: PG_URL, max: 1, ssl: PG_SSL_CONFIG });
		try {
			await pool.waitForConnection(5000);

			await pool.query('DROP TABLE IF EXISTS pool_ssl_test');
			await pool.query(
				'CREATE TABLE pool_ssl_test (id SERIAL PRIMARY KEY, name TEXT NOT NULL, value INT)'
			);

			await pool.query('INSERT INTO pool_ssl_test (name, value) VALUES ($1, $2)', ['hello', 42]);

			const result = await pool.query('SELECT * FROM pool_ssl_test');
			assert(result.rows.length === 1, 'Expected 1 row');
			assert(result.rows[0]?.name === 'hello', 'Expected name=hello');
			assert(result.rows[0]?.value === 42, 'Expected value=42');

			await pool.query('DROP TABLE pool_ssl_test');
		} finally {
			await pool.close();
		}
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	console.log('🔬 SSL Connection Integration Tests');
	console.log('═'.repeat(60));
	console.log(`   Bun version : ${Bun.version}`);
	console.log(`   Mode        : ${CA_CERT_PATH ? 'local 🐳' : 'cloud ☁️'}`);
	console.log(`   SSL URL     : ${SSL_URL}`);
	console.log(`   Plain URL   : ${PLAIN_URL}`);
	console.log(`   CA cert     : ${CA_CERT_PATH ?? 'none (using system CA store)'}`);

	await testBunSQL();
	await testPostgresClient();
	await testPostgresPool();

	// Summary
	console.log('\n' + '═'.repeat(60));
	console.log(`📊 Results: ${passed} passed, ${failed} failed`);
	console.log('═'.repeat(60));

	if (failed > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('\n💥 Unhandled error:', err);
	process.exit(2);
});
