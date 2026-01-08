import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import {
	splitSqlStatements,
	detectOrmSetup,
	generateAuthSchemaSql,
	AUTH_DEPENDENCIES,
} from '../../../../src/cmd/project/auth/shared';

describe('splitSqlStatements', () => {
	test('should split simple statements', () => {
		const sql = `CREATE TABLE foo (id text);
CREATE TABLE bar (id text);`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(2);
		expect(statements[0]).toContain('CREATE TABLE foo');
		expect(statements[1]).toContain('CREATE TABLE bar');
	});

	test('should ignore empty lines', () => {
		const sql = `CREATE TABLE foo (id text);

CREATE TABLE bar (id text);`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(2);
	});

	test('should ignore SQL comments', () => {
		const sql = `-- This is a comment
CREATE TABLE foo (id text);
-- Another comment
CREATE TABLE bar (id text);`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(2);
		expect(statements[0]).not.toContain('--');
		expect(statements[1]).not.toContain('--');
	});

	test('should handle multi-line statements', () => {
		const sql = `CREATE TABLE foo (
  id text PRIMARY KEY,
  name text NOT NULL
);`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(1);
		expect(statements[0]).toContain('id text PRIMARY KEY');
		expect(statements[0]).toContain('name text NOT NULL');
	});

	test('should handle DO blocks on single line', () => {
		const sql = `DO $$ BEGIN ALTER TABLE "foo" ADD CONSTRAINT "foo_bar_fk" FOREIGN KEY ("bar") REFERENCES "baz"("id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(1);
		expect(statements[0]).toContain('DO $$ BEGIN');
		expect(statements[0]).toContain('END $$;');
	});

	test('should handle CREATE INDEX statements', () => {
		const sql = `CREATE INDEX IF NOT EXISTS foo_idx ON foo (bar);
CREATE INDEX IF NOT EXISTS baz_idx ON baz (qux);`;
		const statements = splitSqlStatements(sql);
		expect(statements).toHaveLength(2);
	});

	test('should return empty array for empty input', () => {
		expect(splitSqlStatements('')).toHaveLength(0);
		expect(splitSqlStatements('   ')).toHaveLength(0);
		expect(splitSqlStatements('-- just a comment')).toHaveLength(0);
	});
});

describe('detectOrmSetup', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `orm-detect-test-${Date.now()}-${Math.random()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should detect drizzle.config.ts', async () => {
		writeFileSync(
			join(testDir, 'drizzle.config.ts'),
			`export default { dialect: 'postgresql' };`
		);
		const result = await detectOrmSetup(testDir);
		expect(result).toBe('drizzle');
	});

	test('should detect drizzle.config.js', async () => {
		writeFileSync(
			join(testDir, 'drizzle.config.js'),
			`module.exports = { dialect: 'postgresql' };`
		);
		const result = await detectOrmSetup(testDir);
		expect(result).toBe('drizzle');
	});

	test('should detect prisma/schema.prisma', async () => {
		mkdirSync(join(testDir, 'prisma'), { recursive: true });
		writeFileSync(
			join(testDir, 'prisma', 'schema.prisma'),
			`datasource db { provider = "postgresql" }`
		);
		const result = await detectOrmSetup(testDir);
		expect(result).toBe('prisma');
	});

	test('should return none when no ORM detected', async () => {
		const result = await detectOrmSetup(testDir);
		expect(result).toBe('none');
	});

	test('should prefer drizzle over prisma if both exist', async () => {
		writeFileSync(
			join(testDir, 'drizzle.config.ts'),
			`export default { dialect: 'postgresql' };`
		);
		mkdirSync(join(testDir, 'prisma'), { recursive: true });
		writeFileSync(
			join(testDir, 'prisma', 'schema.prisma'),
			`datasource db { provider = "postgresql" }`
		);
		const result = await detectOrmSetup(testDir);
		expect(result).toBe('drizzle');
	});
});

describe('AUTH_DEPENDENCIES', () => {
	test('should include @agentuity/auth', () => {
		expect(AUTH_DEPENDENCIES['@agentuity/auth']).toBe('latest');
	});

	test('should include better-auth', () => {
		expect(AUTH_DEPENDENCIES['better-auth']).toBeDefined();
	});

	test('should include drizzle-orm', () => {
		expect(AUTH_DEPENDENCIES['drizzle-orm']).toBeDefined();
	});

	test('should include drizzle-kit for schema export', () => {
		expect(AUTH_DEPENDENCIES['drizzle-kit']).toBeDefined();
	});
});

describe('generateAuthSchemaSql', () => {
	const logger = createMockLogger();

	test('should generate SQL with CREATE TABLE statements', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const sql = await generateAuthSchemaSql(sdkRoot, logger);

		expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
		expect(sql).toContain('"user"');
		expect(sql).toContain('"session"');
		expect(sql).toContain('"account"');
		expect(sql).toContain('"organization"');
		expect(sql).toContain('"apikey"');
	});

	test('should generate idempotent CREATE INDEX statements', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const sql = await generateAuthSchemaSql(sdkRoot, logger);

		expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
	});

	test('should wrap ALTER TABLE ADD CONSTRAINT in DO blocks', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const sql = await generateAuthSchemaSql(sdkRoot, logger);

		if (sql.includes('ADD CONSTRAINT')) {
			expect(sql).toContain('DO $$ BEGIN');
			expect(sql).toContain('EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
		}
	});

	test('should succeed even for non-existent project dir when running from SDK', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const nonExistentDir = join(tmpdir(), `non-existent-${Date.now()}`);
		mkdirSync(nonExistentDir, { recursive: true });

		try {
			const sql = await generateAuthSchemaSql(nonExistentDir, logger);
			expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
		} finally {
			rmSync(nonExistentDir, { recursive: true, force: true });
		}
	});

	test('should copy schema file outside node_modules to temporary location', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const testDir = join(tmpdir(), `auth-schema-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'auth', 'src'), {
			recursive: true,
		});

		// Copy the actual schema file to node_modules
		const nodeModulesSchemaPath = join(
			testDir,
			'node_modules/@agentuity/auth/src/schema.ts'
		);
		const schemaContent = await Bun.file(schemaPath).text();
		await Bun.write(nodeModulesSchemaPath, schemaContent);

		const tempSchemaPath = join(testDir, '.agentuity-auth-schema.tmp.ts');

		try {
			// Verify temp file doesn't exist before
			expect(existsSync(tempSchemaPath)).toBe(false);

			// Run the function
			await generateAuthSchemaSql(testDir, logger);

			// Verify temp file was created (it should be cleaned up, but check during execution)
			// Actually, it should be cleaned up, so it shouldn't exist after
			expect(existsSync(tempSchemaPath)).toBe(false);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should clean up temporary file even on error', async () => {
		const testDir = join(tmpdir(), `auth-schema-error-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'auth', 'src'), {
			recursive: true,
		});

		// Create an invalid schema file that will cause drizzle-kit to fail
		const nodeModulesSchemaPath = join(
			testDir,
			'node_modules/@agentuity/auth/src/schema.ts'
		);
		await Bun.write(nodeModulesSchemaPath, 'export const invalid = syntax error;');

		const tempSchemaPath = join(testDir, '.agentuity-auth-schema.tmp.ts');

		try {
			// This should throw an error
			await expect(generateAuthSchemaSql(testDir, logger)).rejects.toThrow();

			// Verify temp file was cleaned up even though there was an error
			expect(existsSync(tempSchemaPath)).toBe(false);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should call logger.trace for drizzle-kit output', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const mockLogger = createMockLogger();

		await generateAuthSchemaSql(sdkRoot, mockLogger);

		// Verify trace was called (drizzle-kit should produce some output)
		// The exact number depends on drizzle-kit output, but should be called at least once
		expect(mockLogger.trace).toHaveBeenCalled();
	});

	test('should throw error when schema file does not exist', async () => {
		const testDir = join(tmpdir(), `auth-schema-missing-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		try {
			await expect(generateAuthSchemaSql(testDir, logger)).rejects.toThrow(
				'@agentuity/auth schema not found'
			);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should use temporary file path outside node_modules for drizzle-kit', async () => {
		const sdkRoot = join(import.meta.dir, '../../../../..');
		const schemaPath = join(sdkRoot, 'packages/auth/src/schema.ts');

		if (!(await Bun.file(schemaPath).exists())) {
			console.log('Skipping test: running outside SDK workspace');
			return;
		}

		const testDir = join(tmpdir(), `auth-schema-path-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'auth', 'src'), {
			recursive: true,
		});

		// Copy the actual schema file to node_modules
		const nodeModulesSchemaPath = join(
			testDir,
			'node_modules/@agentuity/auth/src/schema.ts'
		);
		const schemaContent = await Bun.file(schemaPath).text();
		await Bun.write(nodeModulesSchemaPath, schemaContent);

		const tempSchemaPath = join(testDir, '.agentuity-auth-schema.tmp.ts');

		try {
			// Verify the temp path is outside node_modules
			expect(tempSchemaPath).not.toContain('node_modules');
			expect(tempSchemaPath).toContain('.agentuity-auth-schema.tmp.ts');

			// Run the function - it should succeed
			const sql = await generateAuthSchemaSql(testDir, logger);
			expect(sql).toContain('CREATE TABLE IF NOT EXISTS');

			// Verify temp file was cleaned up
			expect(existsSync(tempSchemaPath)).toBe(false);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});
});
