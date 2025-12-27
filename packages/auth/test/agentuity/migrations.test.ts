import { describe, test, expect } from 'bun:test';
import { AGENTUITY_AUTH_BASELINE_SQL, ensureAuthSchema } from '../../src/agentuity/migrations';

describe('AGENTUITY_AUTH_BASELINE_SQL', () => {
	test('contains core BetterAuth tables', () => {
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "user"');
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "session"');
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "account"');
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "verification"');
	});

	test('contains organization plugin tables', () => {
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "organization"');
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "member"');
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "invitation"');
	});

	test('contains JWT plugin table', () => {
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "jwks"');
	});

	test('contains API key plugin table', () => {
		// Note: BetterAuth expects lowercase table name "apikey"
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS apikey');
	});

	test('contains indexes', () => {
		// Note: Index names are lowercase (without quotes) for PostgreSQL compatibility
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain(
			'CREATE INDEX IF NOT EXISTS session_userId_idx'
		);
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain(
			'CREATE INDEX IF NOT EXISTS account_userId_idx'
		);
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE INDEX IF NOT EXISTS apikey_userId_idx');
	});

	test('uses IF NOT EXISTS for idempotency', () => {
		// Count occurrences of IF NOT EXISTS
		const matches = AGENTUITY_AUTH_BASELINE_SQL.match(/IF NOT EXISTS/g) || [];
		// Should have at least one for each table and index
		expect(matches.length).toBeGreaterThan(10);
	});
});

describe('ensureAuthSchema', () => {
	test('always returns created: true (idempotent SQL)', async () => {
		let sqlExecuted = false;

		const mockDb = {
			query: async (text: string) => {
				if (text.includes('CREATE TABLE')) {
					sqlExecuted = true;
				}
				return { rows: [] };
			},
		};

		const result = await ensureAuthSchema({ db: mockDb });
		expect(result).toEqual({ created: true });
		expect(sqlExecuted).toBe(true);
	});

	test('executes baseline SQL with all required tables', async () => {
		const executedSql: string[] = [];

		const mockDb = {
			query: async (text: string) => {
				executedSql.push(text);
				return { rows: [] };
			},
		};

		await ensureAuthSchema({ db: mockDb });

		// Should have executed the baseline SQL
		expect(executedSql.length).toBe(1);
		expect(executedSql[0]).toContain('CREATE TABLE IF NOT EXISTS "user"');
		expect(executedSql[0]).toContain('CREATE TABLE IF NOT EXISTS apikey');
	});
});
