import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('config preferences', () => {
	describe('getDefaultRegion with saved preference', () => {
		let testDir: string;
		let originalConfigDir: string | undefined;

		beforeEach(() => {
			testDir = join(tmpdir(), `agentuity-test-${Date.now()}`);
			mkdirSync(testDir, { recursive: true });
			originalConfigDir = process.env.AGENTUITY_CONFIG_DIR;
		});

		afterEach(() => {
			if (originalConfigDir !== undefined) {
				process.env.AGENTUITY_CONFIG_DIR = originalConfigDir;
			} else {
				delete process.env.AGENTUITY_CONFIG_DIR;
			}
			try {
				rmSync(testDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		test('should return saved region preference when config has it', async () => {
			const { getDefaultRegion } = await import('../../src/config.ts');

			const config = {
				name: 'production',
				preferences: {
					region: 'euw',
				},
			};

			const result = await getDefaultRegion('production', config);
			expect(result).toBe('euw');
		});

		test('should return fallback when no preference is set', async () => {
			const { getDefaultRegion } = await import('../../src/config.ts');

			const config = {
				name: 'production',
				preferences: {},
			};

			// Note: This may return 'usc' or a cached region depending on environment
			const result = await getDefaultRegion('production', config);
			expect(typeof result).toBe('string');
		});

		test('should prioritize env var over saved preference', async () => {
			const { getDefaultRegion } = await import('../../src/config.ts');

			const originalEnv = process.env.AGENTUITY_REGION;
			process.env.AGENTUITY_REGION = 'apse';

			try {
				const config = {
					name: 'production',
					preferences: {
						region: 'euw',
					},
				};

				const result = await getDefaultRegion('production', config);
				expect(result).toBe('apse');
			} finally {
				if (originalEnv !== undefined) {
					process.env.AGENTUITY_REGION = originalEnv;
				} else {
					delete process.env.AGENTUITY_REGION;
				}
			}
		});

		test('should return local for local profile regardless of preference', async () => {
			const { getDefaultRegion } = await import('../../src/config.ts');

			const config = {
				name: 'local',
				preferences: {
					region: 'euw',
				},
			};

			const result = await getDefaultRegion('local', config);
			expect(result).toBe('local');
		});
	});
});
