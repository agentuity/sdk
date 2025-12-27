import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	AUTH_DEPENDENCIES,
	AGENTUITY_AUTH_BASELINE_SQL,
	generateAuthFileContent,
	splitSqlStatements,
} from '../../../../src/cmd/project/auth/shared';

describe('project auth shared', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `auth-shared-test-${Date.now()}-${Math.random()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('AUTH_DEPENDENCIES', () => {
		test('should include @agentuity/auth', () => {
			expect(AUTH_DEPENDENCIES['@agentuity/auth']).toBe('latest');
		});

		test('should include better-auth', () => {
			expect(AUTH_DEPENDENCIES['better-auth']).toBe('^1.2.0');
		});

		test('should include pg', () => {
			expect(AUTH_DEPENDENCIES['pg']).toBe('^8.13.0');
		});

		test('should have exactly 3 dependencies', () => {
			expect(Object.keys(AUTH_DEPENDENCIES)).toHaveLength(3);
		});
	});

	describe('AGENTUITY_AUTH_BASELINE_SQL', () => {
		test('should include user table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "user"');
		});

		test('should include session table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "session"');
		});

		test('should include account table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "account"');
		});

		test('should include verification table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "verification"');
		});

		test('should include organization table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "organization"');
		});

		test('should include member table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "member"');
		});

		test('should include invitation table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "invitation"');
		});

		test('should include jwks table creation', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS "jwks"');
		});

		test('should include apiKey table creation', () => {
			// Note: BetterAuth expects lowercase table name "apikey" (not "apiKey")
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE TABLE IF NOT EXISTS apikey');
		});

		test('should include indexes', () => {
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('CREATE INDEX IF NOT EXISTS');
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('session_userId_idx');
			expect(AGENTUITY_AUTH_BASELINE_SQL).toContain('apikey_key_idx');
		});

		test('should be idempotent (uses IF NOT EXISTS)', () => {
			const createStatements = AGENTUITY_AUTH_BASELINE_SQL.match(/CREATE TABLE/g) || [];
			const ifNotExistsCount =
				AGENTUITY_AUTH_BASELINE_SQL.match(/CREATE TABLE IF NOT EXISTS/g) || [];
			expect(createStatements.length).toBe(ifNotExistsCount.length);
		});
	});

	describe('generateAuthFileContent', () => {
		test('should return valid TypeScript content', () => {
			const content = generateAuthFileContent();
			expect(content).toContain("import { Pool } from 'pg'");
		});

		test('should import from @agentuity/auth/agentuity', () => {
			const content = generateAuthFileContent();
			expect(content).toContain("from '@agentuity/auth/agentuity'");
		});

		test('should create pool with DATABASE_URL', () => {
			const content = generateAuthFileContent();
			expect(content).toContain('connectionString: process.env.DATABASE_URL');
		});

		test('should export auth instance', () => {
			const content = generateAuthFileContent();
			expect(content).toContain('export const auth = createAgentuityAuth');
		});

		test('should export authMiddleware', () => {
			const content = generateAuthFileContent();
			expect(content).toContain('export const authMiddleware = createSessionMiddleware');
		});

		test('should set basePath to /api/auth', () => {
			const content = generateAuthFileContent();
			expect(content).toContain("basePath: '/api/auth'");
		});
	});

	describe('splitSqlStatements', () => {
		test('should split simple statements', () => {
			const sql = 'SELECT 1;\nSELECT 2;';
			const statements = splitSqlStatements(sql);
			expect(statements).toHaveLength(2);
			expect(statements[0]).toBe('SELECT 1;');
			expect(statements[1]).toBe('SELECT 2;');
		});

		test('should handle multi-line statements', () => {
			const sql = `CREATE TABLE test (
    id INT
);`;
			const statements = splitSqlStatements(sql);
			expect(statements).toHaveLength(1);
			expect(statements[0]).toContain('CREATE TABLE test');
		});

		test('should skip comments', () => {
			const sql = '-- This is a comment\nSELECT 1;';
			const statements = splitSqlStatements(sql);
			expect(statements).toHaveLength(1);
			expect(statements[0]).toBe('SELECT 1;');
		});

		test('should skip empty lines', () => {
			const sql = 'SELECT 1;\n\n\nSELECT 2;';
			const statements = splitSqlStatements(sql);
			expect(statements).toHaveLength(2);
		});

		test('should handle AGENTUITY_AUTH_BASELINE_SQL', () => {
			const statements = splitSqlStatements(AGENTUITY_AUTH_BASELINE_SQL);
			// Should have 9 tables + 7 indexes = 16 statements
			expect(statements.length).toBeGreaterThanOrEqual(15);
			// Each statement should be valid (not empty, ends with semicolon)
			for (const stmt of statements) {
				expect(stmt.trim()).not.toBe('');
				expect(stmt.trim().endsWith(';')).toBe(true);
			}
		});

		test('should not include standalone semicolons', () => {
			const sql = 'SELECT 1;\n;\nSELECT 2;';
			const statements = splitSqlStatements(sql);
			expect(statements).toHaveLength(2);
		});
	});
});
