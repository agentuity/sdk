import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import {
	loadBuildConfig,
	executeBuildConfig,
	mergeBuildConfig,
} from '../../src/cmd/build/config-loader';
import type { BuildPhase, BuildContext, BuildConfig } from '../../src/types';
import { createLogger } from '@agentuity/server';

const testDir = join(import.meta.dir, 'fixtures', 'config-loader');

// Helper to create a mock BuildContext
function createMockContext(_phase: BuildPhase = 'api'): BuildContext {
	return {
		rootDir: testDir,
		dev: false,
		outDir: join(testDir, '.agentuity'),
		srcDir: join(testDir, 'src'),
		orgId: 'test-org',
		projectId: 'test-project',
		region: 'local',
		logger: createLogger({
			logLevel: 'error', // Suppress logs during tests
			timestamps: false,
			prefix: '',
		}),
	};
}

describe('config-loader', () => {
	describe('loadBuildConfig', () => {
		test('returns null when config file does not exist', async () => {
			const nonExistentDir = join(testDir, 'non-existent');
			const config = await loadBuildConfig(nonExistentDir);
			expect(config).toBeNull();
		});

		test('loads valid config file', async () => {
			const configDir = join(testDir, 'valid-config');
			mkdirSync(configDir, { recursive: true });

			// Create a valid config file
			const configPath = join(configDir, 'agentuity.config.ts');
			await Bun.write(
				configPath,
				`
export default function config(phase, context) {
	return { plugins: [] };
}
			`
			);

			const config = await loadBuildConfig(configDir);
			expect(config).not.toBeNull();
			expect(typeof config).toBe('function');

			// Cleanup
			rmSync(configDir, { recursive: true, force: true });
		});

		test('throws error for non-function export', async () => {
			const configDir = join(testDir, 'invalid-export');
			mkdirSync(configDir, { recursive: true });

			const configPath = join(configDir, 'agentuity.config.ts');
			await Bun.write(
				configPath,
				`
export default { plugins: [] };
			`
			);

			await expect(loadBuildConfig(configDir)).rejects.toThrow(
				'agentuity.config.ts must export a default function'
			);

			// Cleanup
			rmSync(configDir, { recursive: true, force: true });
		});
	});

	describe('executeBuildConfig', () => {
		test('executes config function and returns result', async () => {
			const mockConfig = (_phase: BuildPhase, _context: BuildContext): BuildConfig => ({
				plugins: [],
				external: ['test-module'],
			});

			const result = await executeBuildConfig(mockConfig, 'api', createMockContext());
			expect(result).toEqual({
				plugins: [],
				external: ['test-module'],
			});
		});

		test('supports async config functions', async () => {
			const mockConfig = async (
				_phase: BuildPhase,
				_context: BuildContext
			): Promise<BuildConfig> => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { plugins: [] };
			};

			const result = await executeBuildConfig(mockConfig, 'api', createMockContext());
			expect(result).toEqual({ plugins: [] });
		});

		test('validates plugins array', async () => {
			const mockConfig = (): BuildConfig => ({
				// @ts-expect-error - Testing invalid type
				plugins: 'not-an-array',
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'plugins for phase "api" must be an array'
			);
		});

		test('validates plugin objects have name property', async () => {
			const mockConfig = (): BuildConfig => ({
				// @ts-expect-error - Testing invalid plugin
				plugins: [{ setup: () => {} }], // Missing name
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'Invalid plugin in phase "api"'
			);
		});

		test('validates external array', async () => {
			const mockConfig = (): BuildConfig => ({
				// @ts-expect-error - Testing invalid type
				external: 'not-an-array',
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'external for phase "api" must be an array'
			);
		});

		test('validates external values are strings', async () => {
			const mockConfig = (): BuildConfig => ({
				// @ts-expect-error - Testing invalid type
				external: [123],
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'all externals must be strings'
			);
		});

		test('validates define is an object', async () => {
			const mockConfig = (): BuildConfig => ({
				// @ts-expect-error - Testing invalid type
				define: 'not-an-object',
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'define for phase "api" must be an object'
			);
		});

		test('validates define values are strings', async () => {
			const mockConfig = (): BuildConfig => ({
				define: {
					// @ts-expect-error - Testing invalid type
					MY_VAR: 123,
				},
			});

			await expect(executeBuildConfig(mockConfig, 'api', createMockContext())).rejects.toThrow(
				'define values for phase "api" must be strings'
			);
		});

		test('filters reserved define keys', async () => {
			const mockConfig = (): BuildConfig => ({
				define: {
					'process.env.AGENTUITY_CLOUD_ORG_ID': '"override"', // Reserved
					'process.env.MY_CUSTOM_VAR': '"allowed"', // Not reserved
					'process.env.NODE_ENV': '"production"', // Reserved
				},
			});

			const result = await executeBuildConfig(mockConfig, 'api', createMockContext());

			// Reserved keys should be filtered out
			expect(result.define).toEqual({
				'process.env.MY_CUSTOM_VAR': '"allowed"',
			});
		});
	});

	describe('mergeBuildConfig', () => {
		test('merges plugins by appending user plugins', () => {
			const basePlugin = { name: 'base-plugin', setup: () => {} };
			const userPlugin = { name: 'user-plugin', setup: () => {} };

			const base = {
				plugins: [basePlugin],
			};

			const user = {
				plugins: [userPlugin],
			};

			const merged = mergeBuildConfig(base, user);
			expect(merged.plugins).toEqual([basePlugin, userPlugin]);
		});

		test('merges external arrays and deduplicates', () => {
			const base = {
				external: ['base-module', 'shared-module'],
			};

			const user = {
				external: ['user-module', 'shared-module'], // shared-module duplicated
			};

			const merged = mergeBuildConfig(base, user);
			expect(merged.external).toEqual(['base-module', 'shared-module', 'user-module']);
		});

		test('merges define objects with user taking precedence', () => {
			const base = {
				define: {
					BASE_VAR: '"base"',
					SHARED_VAR: '"base"',
				},
			};

			const user = {
				define: {
					USER_VAR: '"user"',
					SHARED_VAR: '"user"', // Should override
				},
			};

			const merged = mergeBuildConfig(base, user);
			expect(merged.define).toEqual({
				BASE_VAR: '"base"',
				SHARED_VAR: '"user"', // User overrides base
				USER_VAR: '"user"',
			});
		});

		test('handles empty user config', () => {
			const base = {
				plugins: [{ name: 'test', setup: () => {} }],
				external: ['test-module'],
				define: { TEST: '"test"' },
			};

			const merged = mergeBuildConfig(base, {});
			expect(merged).toEqual(base);
		});

		test('handles base with no arrays', () => {
			const base = {};
			const user = {
				plugins: [{ name: 'test', setup: () => {} }],
				external: ['test-module'],
			};

			const merged = mergeBuildConfig(base, user);
			expect(merged.plugins?.length).toBe(1);
			expect(merged.external).toEqual(['test-module']);
		});
	});

	describe('phase-specific behavior', () => {
		test('different phases can return different configs', async () => {
			const mockConfig = (phase: BuildPhase): BuildConfig => {
				if (phase === 'api') {
					return { external: ['api-module'] };
				}
				if (phase === 'web') {
					return { external: ['web-module'] };
				}
				return {};
			};

			const apiResult = await executeBuildConfig(mockConfig, 'api', createMockContext('api'));
			const webResult = await executeBuildConfig(mockConfig, 'web', createMockContext('web'));

			expect(apiResult.external).toEqual(['api-module']);
			expect(webResult.external).toEqual(['web-module']);
		});

		test('context passed to config function contains correct data', async () => {
			let capturedContext: BuildContext | null = null;

			const mockConfig = (phase: BuildPhase, context: BuildContext): BuildConfig => {
				capturedContext = context;
				return {};
			};

			const ctx = createMockContext('api');
			await executeBuildConfig(mockConfig, 'api', ctx);

			expect(capturedContext).not.toBeNull();
			expect(capturedContext?.rootDir).toBe(testDir);
			expect(capturedContext?.dev).toBe(false);
			expect(capturedContext?.region).toBe('local');
		});
	});
});
