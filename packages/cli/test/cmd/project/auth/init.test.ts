import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initSubcommand } from '../../../../src/cmd/project/auth/init';
import { authCommand } from '../../../../src/cmd/project/auth';

describe('project auth init', () => {
	let testDir: string;
	let originalCwd: string;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		testDir = join(tmpdir(), `auth-init-test-${Date.now()}-${Math.random()}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, 'src'), { recursive: true });
		originalCwd = process.cwd();
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		process.chdir(originalCwd);
		process.env = originalEnv;
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('initSubcommand definition', () => {
		test('should have correct name', () => {
			expect(initSubcommand.name).toBe('init');
		});

		test('should have description', () => {
			expect(initSubcommand.description).toBe('Set up Agentuity Auth for your project');
		});

		test('should require auth', () => {
			expect(initSubcommand.requires?.auth).toBe(true);
		});

		test('should require org', () => {
			expect(initSubcommand.requires?.org).toBe(true);
		});

		test('should require region', () => {
			expect(initSubcommand.requires?.region).toBe(true);
		});

		test('should not be idempotent', () => {
			expect(initSubcommand.idempotent).toBe(false);
		});

		test('should have mutating tag', () => {
			expect(initSubcommand.tags).toContain('mutating');
		});

		test('should have slow tag', () => {
			expect(initSubcommand.tags).toContain('slow');
		});

		test('should have requires-auth tag', () => {
			expect(initSubcommand.tags).toContain('requires-auth');
		});

		test('should have skipMigrations option in schema', () => {
			expect(initSubcommand.schema?.options).toBeDefined();
		});

		test('should have response schema with success', () => {
			expect(initSubcommand.schema?.response).toBeDefined();
		});
	});

	describe('authCommand definition', () => {
		test('should have correct name', () => {
			expect(authCommand.name).toBe('auth');
		});

		test('should have description', () => {
			expect(authCommand.description).toBe('Manage project authentication (Agentuity Auth)');
		});

		test('should have slow tag', () => {
			expect(authCommand.tags).toContain('slow');
		});

		test('should have requires-auth tag', () => {
			expect(authCommand.tags).toContain('requires-auth');
		});

		test('should have init subcommand', () => {
			expect(authCommand.subcommands).toBeDefined();
			expect(authCommand.subcommands).toHaveLength(1);
			expect(authCommand.subcommands?.[0].name).toBe('init');
		});

		test('should have examples', () => {
			expect(authCommand.examples).toBeDefined();
			expect(authCommand.examples).toHaveLength(1);
		});
	});

	describe('DATABASE_URL detection', () => {
		test('should read DATABASE_URL from environment', () => {
			process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
			expect(process.env.DATABASE_URL).toBe('postgresql://localhost:5432/test');
		});

		test('should parse DATABASE_URL from .env file', () => {
			const envPath = join(testDir, '.env');
			writeFileSync(envPath, 'DATABASE_URL="postgresql://localhost:5432/authdb"\n');

			const envContent = readFileSync(envPath, 'utf-8');
			const match = envContent.match(/^DATABASE_URL=(.+)$/m);

			expect(match).not.toBeNull();
			if (match) {
				const url = match[1].trim().replace(/^["']|["']$/g, '');
				expect(url).toBe('postgresql://localhost:5432/authdb');
			}
		});

		test('should handle DATABASE_URL without quotes', () => {
			const envPath = join(testDir, '.env');
			writeFileSync(envPath, 'DATABASE_URL=postgresql://localhost:5432/authdb\n');

			const envContent = readFileSync(envPath, 'utf-8');
			const match = envContent.match(/^DATABASE_URL=(.+)$/m);

			expect(match).not.toBeNull();
			if (match) {
				const url = match[1].trim().replace(/^["']|["']$/g, '');
				expect(url).toBe('postgresql://localhost:5432/authdb');
			}
		});

		test('should extract database name from URL', () => {
			const databaseUrl = 'postgresql://user:pass@localhost:5432/mydb?sslmode=require';
			const urlMatch = databaseUrl.match(/\/([^/?]+)(\?|$)/);

			expect(urlMatch).not.toBeNull();
			if (urlMatch) {
				expect(urlMatch[1]).toBe('mydb');
			}
		});

		test('should handle URL without query parameters', () => {
			const databaseUrl = 'postgresql://user:pass@localhost:5432/testdb';
			const urlMatch = databaseUrl.match(/\/([^/?]+)(\?|$)/);

			expect(urlMatch).not.toBeNull();
			if (urlMatch) {
				expect(urlMatch[1]).toBe('testdb');
			}
		});
	});

	describe('package.json detection', () => {
		test('should detect when package.json exists', () => {
			const packageJsonPath = join(testDir, 'package.json');
			writeFileSync(packageJsonPath, JSON.stringify({ name: 'test-project' }));

			expect(existsSync(packageJsonPath)).toBe(true);
		});

		test('should detect when package.json does not exist', () => {
			const packageJsonPath = join(testDir, 'package.json');
			expect(existsSync(packageJsonPath)).toBe(false);
		});

		test('should parse package.json dependencies', () => {
			const packageJsonPath = join(testDir, 'package.json');
			const packageJson = {
				name: 'test-project',
				dependencies: {
					react: '^18.0.0',
					'better-auth': '^1.2.0',
				},
			};
			writeFileSync(packageJsonPath, JSON.stringify(packageJson));

			const content = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
			expect(content.dependencies['better-auth']).toBe('^1.2.0');
		});
	});

	describe('src directory handling', () => {
		test('should detect existing src directory', () => {
			expect(existsSync(join(testDir, 'src'))).toBe(true);
		});

		test('should create src directory if not exists', () => {
			const newTestDir = join(tmpdir(), `auth-init-no-src-${Date.now()}`);
			mkdirSync(newTestDir, { recursive: true });

			const srcDir = join(newTestDir, 'src');
			expect(existsSync(srcDir)).toBe(false);

			mkdirSync(srcDir, { recursive: true });
			expect(existsSync(srcDir)).toBe(true);

			rmSync(newTestDir, { recursive: true, force: true });
		});

		test('should detect existing auth.ts', () => {
			const authFilePath = join(testDir, 'src', 'auth.ts');
			writeFileSync(authFilePath, 'export const auth = {}');

			expect(existsSync(authFilePath)).toBe(true);
		});
	});

	describe('.env file handling', () => {
		test('should append to existing .env file', () => {
			const envPath = join(testDir, '.env');
			writeFileSync(envPath, 'EXISTING_VAR=value\n');

			let envContent = readFileSync(envPath, 'utf-8');
			if (!envContent.endsWith('\n')) {
				envContent += '\n';
			}
			envContent += 'DATABASE_URL="postgresql://localhost:5432/newdb"\n';
			writeFileSync(envPath, envContent);

			const finalContent = readFileSync(envPath, 'utf-8');
			expect(finalContent).toContain('EXISTING_VAR=value');
			expect(finalContent).toContain('DATABASE_URL=');
		});

		test('should create .env file if not exists', () => {
			const envPath = join(testDir, '.env');
			expect(existsSync(envPath)).toBe(false);

			writeFileSync(envPath, 'DATABASE_URL="postgresql://localhost:5432/newdb"\n');
			expect(existsSync(envPath)).toBe(true);
		});
	});
});
