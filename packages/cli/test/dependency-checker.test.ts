import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkAndUpgradeDependencies } from '../src/utils/dependency-checker';
import { createMockLogger } from '@agentuity/test-utils';

describe('dependency-checker', () => {
	let testDir: string;
	let originalIsTTY: boolean;

	beforeEach(() => {
		// Create a temporary test directory
		testDir = join(tmpdir(), `dependency-checker-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'core'), { recursive: true });

		// Mock stdin.isTTY for testing
		originalIsTTY = process.stdin.isTTY;
		Object.defineProperty(process.stdin, 'isTTY', {
			value: true,
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		// Clean up test directory
		rmSync(testDir, { recursive: true, force: true });

		// Restore stdin.isTTY
		Object.defineProperty(process.stdin, 'isTTY', {
			value: originalIsTTY,
			writable: true,
			configurable: true,
		});
	});

	test('skips when no @agentuity packages found', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				react: '^18.0.0',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		expect(result.upgraded).toEqual([]);
		expect(result.skipped).toEqual([]);
		expect(result.failed).toEqual([]);
	});

	test('skips pinned versions', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': '1.2.3',
				'@agentuity/server': '1.2.3',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create mock installed packages at same version
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'server'), { recursive: true });
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'core', 'package.json'),
			JSON.stringify({ version: '1.2.3' })
		);
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'server', 'package.json'),
			JSON.stringify({ version: '1.2.3' })
		);

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		expect(result.upgraded).toEqual([]);
		expect(result.skipped.length).toBe(2);
	});

	test('identifies "latest" versions for upgrade', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': 'latest',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create mock installed package at old version
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'core', 'package.json'),
			JSON.stringify({ version: '1.0.0' })
		);

		const logger = createMockLogger();

		// This will attempt to install, which will fail in test environment
		// But we can verify it tried to upgrade
		const result = await checkAndUpgradeDependencies(testDir, logger);

		// In test environment, install will fail but that's expected
		expect(result.upgraded.length + result.failed.length).toBeGreaterThan(0);
	});

	test('identifies "*" versions for upgrade', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': '*',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create mock installed package at old version
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'core', 'package.json'),
			JSON.stringify({ version: '1.0.0' })
		);

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		// In test environment, install will fail but that's expected
		expect(result.upgraded.length + result.failed.length).toBeGreaterThan(0);
	});

	test('identifies range versions for upgrade', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': '^1.0.0',
				'@agentuity/server': '~2.0.0',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create mock installed packages at old versions
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'server'), { recursive: true });
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'core', 'package.json'),
			JSON.stringify({ version: '1.0.0' })
		);
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'server', 'package.json'),
			JSON.stringify({ version: '2.0.0' })
		);

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		// In test environment, install will fail but that's expected
		expect(result.upgraded.length + result.failed.length).toBeGreaterThan(0);
	});

	test('skips in non-TTY environment', async () => {
		// Set stdin.isTTY to false
		Object.defineProperty(process.stdin, 'isTTY', {
			value: false,
			writable: true,
			configurable: true,
		});

		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': 'latest',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		expect(result.upgraded).toEqual([]);
		expect(result.skipped).toEqual([]);
		expect(result.failed).toEqual([]);
	});

	test('handles missing package.json gracefully', async () => {
		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		expect(result.upgraded).toEqual([]);
		expect(result.skipped).toEqual([]);
		expect(result.failed).toEqual([]);
	});

	test('handles both dependencies and devDependencies', async () => {
		const packageJson = {
			name: 'test-app',
			dependencies: {
				'@agentuity/core': 'latest',
			},
			devDependencies: {
				'@agentuity/cli': '^1.0.0',
			},
		};

		writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

		// Create mock installed packages
		mkdirSync(join(testDir, 'node_modules', '@agentuity', 'cli'), { recursive: true });
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'core', 'package.json'),
			JSON.stringify({ version: '1.0.0' })
		);
		writeFileSync(
			join(testDir, 'node_modules', '@agentuity', 'cli', 'package.json'),
			JSON.stringify({ version: '1.0.0' })
		);

		const logger = createMockLogger();
		const result = await checkAndUpgradeDependencies(testDir, logger);

		// Both packages should be identified for upgrade
		expect(result.upgraded.length + result.failed.length).toBeGreaterThanOrEqual(2);
	});
});
