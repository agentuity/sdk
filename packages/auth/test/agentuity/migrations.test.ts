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
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "apiKey"');
	});

	test('contains indexes', () => {
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain(
			'CREATE INDEX IF NOT EXISTS "session_userId_idx"'
		);
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain(
			'CREATE INDEX IF NOT EXISTS "account_userId_idx"'
		);
		expect(AGENTUITY_AUTH_BASELINE_SQL).toContain(
			'CREATE INDEX IF NOT EXISTS "apiKey_userId_idx"'
		);
	});

	test('uses IF NOT EXISTS for idempotency', () => {
		// Count occurrences of IF NOT EXISTS
		const matches = AGENTUITY_AUTH_BASELINE_SQL.match(/IF NOT EXISTS/g) || [];
		// Should have at least one for each table and index
		expect(matches.length).toBeGreaterThan(10);
	});
});

describe('ensureAuthSchema', () => {
	test('returns created: false when table already exists', async () => {
		const mockDb = {
			query: async (text: string, _params?: unknown[]) => {
				if (text.includes('to_regclass')) {
					// Simulate table exists
					return { rows: [{ table_name: 'user' }] };
				}
				return { rows: [] };
			},
		};

		const result = await ensureAuthSchema({ db: mockDb });
		expect(result).toEqual({ created: false });
	});

	test('returns created: true and runs SQL when table does not exist', async () => {
		let sqlExecuted = false;

		const mockDb = {
			query: async (text: string, _params?: unknown[]) => {
				if (text.includes('to_regclass')) {
					// Simulate table does not exist
					return { rows: [{ table_name: null }] };
				}
				// This is the baseline SQL being executed
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

	test('uses custom schema when provided', async () => {
		let schemaUsed = '';

		const mockDb = {
			query: async (text: string, params?: unknown[]) => {
				if (text.includes('to_regclass') && params) {
					schemaUsed = params[0] as string;
					return { rows: [{ table_name: 'user' }] };
				}
				return { rows: [] };
			},
		};

		await ensureAuthSchema({ db: mockDb, schema: 'custom_schema' });
		expect(schemaUsed).toBe('custom_schema.user');
	});
});
