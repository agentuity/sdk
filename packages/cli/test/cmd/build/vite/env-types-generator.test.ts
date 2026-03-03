import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateEnvTypes } from '../../../../src/cmd/build/vite/env-types-generator.ts';
import type { Logger } from '../../../../src/types.ts';

/**
 * Create a mock logger that captures log messages for testing
 */
function createMockLogger(): Logger & { messages: { level: string; msg: string }[] } {
	const messages: { level: string; msg: string }[] = [];
	const logger: Logger & { messages: { level: string; msg: string }[] } = {
		messages,
		trace: (msg: unknown) => {
			messages.push({ level: 'trace', msg: String(msg) });
		},
		debug: (msg: unknown) => {
			messages.push({ level: 'debug', msg: String(msg) });
		},
		info: (msg: unknown) => {
			messages.push({ level: 'info', msg: String(msg) });
		},
		warn: (msg: unknown) => {
			messages.push({ level: 'warn', msg: String(msg) });
		},
		error: (msg: unknown) => {
			messages.push({ level: 'error', msg: String(msg) });
		},
		fatal: (msg: unknown): never => {
			messages.push({ level: 'fatal', msg: String(msg) });
			throw new Error(String(msg));
		},
		child: () => logger, // Return the same logger for simplicity in tests
	};
	return logger;
}

describe('env-types-generator', () => {
	let testDir: string;
	let srcDir: string;
	let logger: ReturnType<typeof createMockLogger>;

	beforeEach(() => {
		// Create unique temp directory for each test
		testDir = join(tmpdir(), `env-types-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		mkdirSync(srcDir, { recursive: true });
		logger = createMockLogger();
	});

	afterEach(() => {
		// Clean up temp directory
		if (testDir && existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('basic functionality', () => {
		test('should return false when no .env files exist', async () => {
			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});
			expect(result).toBe(false);
		});

		test('should return true when types are generated', async () => {
			// Create a .env file
			await Bun.write(join(testDir, '.env'), 'API_KEY=test123\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});
			expect(result).toBe(true);
		});

		test('should create src/generated directory if it does not exist', async () => {
			await Bun.write(join(testDir, '.env'), 'MY_VAR=value\n');

			const generatedDir = join(srcDir, 'generated');
			expect(existsSync(generatedDir)).toBe(false);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			expect(existsSync(generatedDir)).toBe(true);
			expect(existsSync(join(generatedDir, 'env.d.ts'))).toBe(true);
		});

		test('should include @generated marker in output', async () => {
			await Bun.write(join(testDir, '.env'), 'TEST_VAR=value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('// @generated');
		});
	});

	describe('ProcessEnv types generation', () => {
		test('should generate correct ProcessEnv types from .env file', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'DATABASE_URL=postgres://localhost\nAPI_KEY=secret\nNODE_ENV=development\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Should include all keys in ProcessEnv
			expect(content).toContain('interface ProcessEnv');
			expect(content).toContain('readonly DATABASE_URL: string;');
			expect(content).toContain('readonly API_KEY: string;');
			expect(content).toContain('readonly NODE_ENV: string;');
		});

		test('should sort keys alphabetically in ProcessEnv', async () => {
			await Bun.write(join(testDir, '.env'), 'ZEBRA=z\nAPPLE=a\nMIDDLE=m\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Find the ProcessEnv section and verify order
			const appleIndex = content.indexOf('readonly APPLE:');
			const middleIndex = content.indexOf('readonly MIDDLE:');
			const zebraIndex = content.indexOf('readonly ZEBRA:');

			expect(appleIndex).toBeLessThan(middleIndex);
			expect(middleIndex).toBeLessThan(zebraIndex);
		});
	});

	describe('ImportMetaEnv types generation', () => {
		test('should generate ImportMetaEnv types only for VITE_ prefixed variables', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'VITE_API_URL=http://api.example.com\nAPI_KEY=secret\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Should include VITE_ in ImportMetaEnv
			expect(content).toContain('interface ImportMetaEnv');

			// Extract ImportMetaEnv section to verify contents
			const importMetaEnvMatch = content.match(/interface ImportMetaEnv \{[\s\S]*?\n\}/);
			expect(importMetaEnvMatch).not.toBeNull();
			const importMetaEnvSection = importMetaEnvMatch![0];

			expect(importMetaEnvSection).toContain('readonly VITE_API_URL: string;');
			// Check that API_KEY is NOT in ImportMetaEnv section
			expect(importMetaEnvSection).not.toContain('API_KEY');
		});

		test('should generate ImportMetaEnv types for AGENTUITY_PUBLIC_ prefixed variables', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'AGENTUITY_PUBLIC_URL=http://public.example.com\nSECRET_KEY=hidden\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Extract ImportMetaEnv section (between "interface ImportMetaEnv {" and the next "}")
			const importMetaEnvMatch = content.match(/interface ImportMetaEnv \{[\s\S]*?\n\}/);
			expect(importMetaEnvMatch).not.toBeNull();
			const importMetaEnvSection = importMetaEnvMatch![0];

			expect(importMetaEnvSection).toContain('readonly AGENTUITY_PUBLIC_URL: string;');
			expect(importMetaEnvSection).not.toContain('SECRET_KEY');
		});

		test('should generate ImportMetaEnv types for PUBLIC_ prefixed variables', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'PUBLIC_BASE_URL=http://base.example.com\nPRIVATE_KEY=secret\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Extract ImportMetaEnv section
			const importMetaEnvMatch = content.match(/interface ImportMetaEnv \{[\s\S]*?\n\}/);
			expect(importMetaEnvMatch).not.toBeNull();
			const importMetaEnvSection = importMetaEnvMatch![0];

			expect(importMetaEnvSection).toContain('readonly PUBLIC_BASE_URL: string;');
			expect(importMetaEnvSection).not.toContain('PRIVATE_KEY');
		});

		test('should include all public prefixes in ImportMetaEnv', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'VITE_VAR=v1\nAGENTUITY_PUBLIC_VAR=v2\nPUBLIC_VAR=v3\nNORMAL_VAR=v4\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Extract ImportMetaEnv section
			const importMetaEnvMatch = content.match(/interface ImportMetaEnv \{[\s\S]*?\n\}/);
			expect(importMetaEnvMatch).not.toBeNull();
			const importMetaEnvSection = importMetaEnvMatch![0];

			expect(importMetaEnvSection).toContain('readonly VITE_VAR: string;');
			expect(importMetaEnvSection).toContain('readonly AGENTUITY_PUBLIC_VAR: string;');
			expect(importMetaEnvSection).toContain('readonly PUBLIC_VAR: string;');
			expect(importMetaEnvSection).not.toContain('NORMAL_VAR');
		});

		test('should show comment when no public variables found', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'DATABASE_URL=postgres://localhost\nAPI_KEY=secret\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			expect(content).toContain(
				'// No VITE_*, AGENTUITY_PUBLIC_*, or PUBLIC_* prefixed variables found'
			);
		});
	});

	describe('env file merging - development mode', () => {
		test('should merge .env and .env.development correctly (dev mode, .env wins)', async () => {
			// In dev mode: read .env.development first, then .env (later overrides earlier)
			await Bun.write(
				join(testDir, '.env.development'),
				'API_URL=http://dev.api.com\nDEV_ONLY=true\n'
			);
			await Bun.write(join(testDir, '.env'), 'API_URL=http://main.api.com\nSHARED=value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// All keys should be present
			expect(content).toContain('readonly API_URL: string;');
			expect(content).toContain('readonly DEV_ONLY: string;');
			expect(content).toContain('readonly SHARED: string;');
		});

		test('should read only .env.development when .env does not exist (dev mode)', async () => {
			await Bun.write(join(testDir, '.env.development'), 'DEV_VAR=development\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly DEV_VAR: string;');
		});

		test('should read only .env when .env.development does not exist (dev mode)', async () => {
			await Bun.write(join(testDir, '.env'), 'MAIN_VAR=main\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly MAIN_VAR: string;');
		});
	});

	describe('env file merging - production mode', () => {
		test('should merge .env and .env.production correctly (prod mode, .env.production wins)', async () => {
			// In prod mode: read .env first, then .env.production (later overrides earlier)
			await Bun.write(join(testDir, '.env'), 'API_URL=http://main.api.com\nSHARED=main\n');
			await Bun.write(
				join(testDir, '.env.production'),
				'API_URL=http://prod.api.com\nPROD_ONLY=true\n'
			);

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: true });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// All keys should be present
			expect(content).toContain('readonly API_URL: string;');
			expect(content).toContain('readonly PROD_ONLY: string;');
			expect(content).toContain('readonly SHARED: string;');
		});

		test('should read only .env.production when .env does not exist (prod mode)', async () => {
			await Bun.write(join(testDir, '.env.production'), 'PROD_VAR=production\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: true,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly PROD_VAR: string;');
		});

		test('should read only .env when .env.production does not exist (prod mode)', async () => {
			await Bun.write(join(testDir, '.env'), 'MAIN_VAR=main\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: true,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly MAIN_VAR: string;');
		});
	});

	describe('edge cases', () => {
		test('should handle empty .env files gracefully', async () => {
			await Bun.write(join(testDir, '.env'), '');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			// Empty file returns empty object, so foundAnyFile stays false
			expect(result).toBe(false);
		});

		test('should handle .env files with only comments', async () => {
			await Bun.write(join(testDir, '.env'), '# This is a comment\n# Another comment\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			// Comments-only file returns empty object
			expect(result).toBe(false);
		});

		test('should handle .env files with empty lines', async () => {
			await Bun.write(join(testDir, '.env'), 'KEY1=value1\n\n\nKEY2=value2\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly KEY1: string;');
			expect(content).toContain('readonly KEY2: string;');
		});

		test('should handle quoted values in .env files', async () => {
			await Bun.write(
				join(testDir, '.env'),
				'DOUBLE_QUOTED="double quoted value"\nSINGLE_QUOTED=\'single quoted value\'\n'
			);

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly DOUBLE_QUOTED: string;');
			expect(content).toContain('readonly SINGLE_QUOTED: string;');
		});

		test('should handle values with equals sign', async () => {
			await Bun.write(join(testDir, '.env'), 'CONNECTION_STRING=host=localhost;port=5432\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly CONNECTION_STRING: string;');
		});

		test('should handle keys with numbers', async () => {
			await Bun.write(join(testDir, '.env'), 'API_V2_KEY=value\nSERVER_1_URL=url\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly API_V2_KEY: string;');
			expect(content).toContain('readonly SERVER_1_URL: string;');
		});

		test('should deduplicate keys across env files (use merged value)', async () => {
			// Both files have the same key
			await Bun.write(join(testDir, '.env.development'), 'DUPLICATE_KEY=dev_value\n');
			await Bun.write(join(testDir, '.env'), 'DUPLICATE_KEY=main_value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Should only appear once in the output
			const matches = content.match(/readonly DUPLICATE_KEY: string;/g);
			expect(matches?.length).toBe(1);
		});

		test('should handle very long key names', async () => {
			const longKey = 'A'.repeat(100);
			await Bun.write(join(testDir, '.env'), `${longKey}=value\n`);

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain(`readonly ${longKey}: string;`);
		});
	});

	describe('output file structure', () => {
		test('should generate proper TypeScript declaration file structure', async () => {
			await Bun.write(join(testDir, '.env'), 'VITE_PUBLIC=pub\nSECRET=sec\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Check overall structure
			expect(content).toContain('declare global {');
			expect(content).toContain('namespace NodeJS {');
			expect(content).toContain('interface ProcessEnv {');
			expect(content).toContain('interface ImportMetaEnv {');
			expect(content).toContain('interface ImportMeta {');
			expect(content).toContain('readonly env: ImportMetaEnv;');
			expect(content).toContain('export {};');
		});

		test('should include auto-generated comment', async () => {
			await Bun.write(join(testDir, '.env'), 'TEST=value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			expect(content).toContain('AUTO-GENERATED from local .env files');
			expect(content).toContain('do not edit manually');
		});

		test('should include issue reporting instructions', async () => {
			await Bun.write(join(testDir, '.env'), 'TEST=value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			expect(content).toContain('FOUND AN ERROR IN THIS FILE?');
			expect(content).toContain('https://github.com/agentuity/sdk/issues');
		});
	});

	describe('logging', () => {
		test('should log debug messages during generation', async () => {
			await Bun.write(join(testDir, '.env'), 'LOG_TEST=value\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const debugMessages = logger.messages.filter((m) => m.level === 'debug');
			expect(debugMessages.length).toBeGreaterThan(0);
			expect(debugMessages.some((m) => m.msg.includes('[env-types]'))).toBe(true);
		});

		test('should log when no env files found', async () => {
			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const debugMessages = logger.messages.filter((m) => m.level === 'debug');
			expect(debugMessages.some((m) => m.msg.includes('No .env files found'))).toBe(true);
		});

		test('should log number of keys generated', async () => {
			await Bun.write(join(testDir, '.env'), 'KEY1=v1\nKEY2=v2\nVITE_KEY=v3\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const debugMessages = logger.messages.filter((m) => m.level === 'debug');
			expect(debugMessages.some((m) => m.msg.includes('3 keys'))).toBe(true);
			expect(debugMessages.some((m) => m.msg.includes('1 public'))).toBe(true);
		});
	});

	describe('existing generated directory', () => {
		test('should work when src/generated directory already exists', async () => {
			// Pre-create the generated directory
			mkdirSync(join(srcDir, 'generated'), { recursive: true });
			await Bun.write(join(testDir, '.env'), 'EXISTING=value\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly EXISTING: string;');
		});

		test('should overwrite existing env.d.ts file', async () => {
			// Pre-create the generated directory with old content
			mkdirSync(join(srcDir, 'generated'), { recursive: true });
			await Bun.write(join(srcDir, 'generated', 'env.d.ts'), '// old content\n');

			await Bun.write(join(testDir, '.env'), 'NEW_KEY=newvalue\n');

			await generateEnvTypes({ rootDir: testDir, srcDir, logger, isProduction: false });

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).not.toContain('// old content');
			expect(content).toContain('readonly NEW_KEY: string;');
		});
	});

	describe('profile support', () => {
		test('should read .env.{profile} file when profile is specified (dev mode)', async () => {
			// Create base .env and profile-specific .env.staging
			await Bun.write(join(testDir, '.env'), 'BASE_VAR=base\nSHARED=from-base\n');
			await Bun.write(
				join(testDir, '.env.staging'),
				'STAGING_VAR=staging\nSHARED=from-staging\n'
			);

			await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
				profile: 'staging',
			});

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// All keys should be present (profile vars merged with base)
			expect(content).toContain('readonly BASE_VAR: string;');
			expect(content).toContain('readonly STAGING_VAR: string;');
			expect(content).toContain('readonly SHARED: string;');
		});

		test('should read .env.{profile} file when profile is specified (prod mode)', async () => {
			await Bun.write(join(testDir, '.env'), 'BASE_VAR=base\n');
			await Bun.write(join(testDir, '.env.production'), 'PROD_VAR=prod\n');
			await Bun.write(join(testDir, '.env.staging'), 'STAGING_VAR=staging\n');

			await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: true,
				profile: 'staging',
			});

			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();

			// Should include vars from .env, .env.production, and .env.staging
			expect(content).toContain('readonly BASE_VAR: string;');
			expect(content).toContain('readonly PROD_VAR: string;');
			expect(content).toContain('readonly STAGING_VAR: string;');
		});

		test('should work when only .env.{profile} exists', async () => {
			// Only create the profile-specific file
			await Bun.write(join(testDir, '.env.test'), 'TEST_VAR=testvalue\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
				profile: 'test',
			});

			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly TEST_VAR: string;');
		});

		test('should log profile name when specified', async () => {
			await Bun.write(join(testDir, '.env'), 'VAR=value\n');

			await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
				profile: 'myprofile',
			});

			const debugMessages = logger.messages.filter((m) => m.level === 'debug');
			expect(debugMessages.some((m) => m.msg.includes('myprofile'))).toBe(true);
		});

		test('should handle missing profile file gracefully', async () => {
			// Only create base .env, no .env.staging
			await Bun.write(join(testDir, '.env'), 'BASE_VAR=base\n');

			const result = await generateEnvTypes({
				rootDir: testDir,
				srcDir,
				logger,
				isProduction: false,
				profile: 'staging', // This file doesn't exist
			});

			// Should still work with just the base .env
			expect(result).toBe(true);
			const content = await Bun.file(join(srcDir, 'generated', 'env.d.ts')).text();
			expect(content).toContain('readonly BASE_VAR: string;');
		});
	});
});
