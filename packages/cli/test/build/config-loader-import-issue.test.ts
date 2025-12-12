import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { loadBuildConfig } from '../../src/cmd/build/config-loader';

const testDir = join(import.meta.dir, 'fixtures', 'config-import-issue');

describe('config-loader import resolution', () => {
	test('loads config with external imports (simulates node_modules context)', async () => {
		// This test reproduces the issue where loading config from node_modules context fails
		mkdirSync(testDir, { recursive: true });

		// Create a config file that imports an external package
		const configPath = join(testDir, 'agentuity.config.ts');
		await Bun.write(
			configPath,
			`
// Import an external package (simulates bun-plugin-tailwind)
import type { BunPlugin } from 'bun';
import type { BuildPhase, BuildContext, BuildConfig } from '@agentuity/cli';

// Mock plugin
const mockPlugin: BunPlugin = {
	name: 'mock-plugin',
	setup() {}
};

export default function config(phase: BuildPhase, context: BuildContext): BuildConfig {
	if (phase === 'web') {
		return {
			plugins: [mockPlugin],
		};
	}
	return {};
}
			`
		);

		// Load the config - this should work even when called from node_modules
		const config = await loadBuildConfig(testDir);
		expect(config).not.toBeNull();
		expect(typeof config).toBe('function');

		// Cleanup
		rmSync(testDir, { recursive: true, force: true });
	});
});
