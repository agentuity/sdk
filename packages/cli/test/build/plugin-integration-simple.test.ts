import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import {
	loadBuildConfig,
	executeBuildConfig,
	mergeBuildConfig,
} from '../../src/cmd/build/config-loader';
import type { BuildContext } from '../../src/types';
import { createLogger } from '@agentuity/server';

const testDir = join(import.meta.dir, 'fixtures', 'plugin-integration-simple');
const outDir = join(testDir, '.agentuity');

describe('Plugin Integration - Simple Verification', () => {
	test('loads and executes Tailwind plugin correctly', async () => {
		// Create test directory
		mkdirSync(testDir, { recursive: true });

		// Create agentuity.config.ts with Tailwind plugin
		const configPath = join(testDir, 'agentuity.config.ts');
		await Bun.write(
			configPath,
			`
import tailwindcss from 'bun-plugin-tailwind';

export default function config(phase, context) {
	context.logger.info('Config executed for phase: ' + phase);
	
	if (phase === 'web') {
		context.logger.info('Adding Tailwind plugin for web phase');
		return {
			plugins: [tailwindcss],
		};
	}
	
	return {};
}
		`
		);

		// Load the config
		const configFunction = await loadBuildConfig(testDir);
		expect(configFunction).not.toBeNull();

		// Create a mock context
		const logger = createLogger({
			logLevel: 'info',
			timestamps: false,
			prefix: '',
		});

		const context: BuildContext = {
			rootDir: testDir,
			dev: false,
			outDir,
			srcDir: join(testDir, 'src'),
			region: 'local',
			logger,
		};

		// Execute for 'api' phase - should return empty config
		const apiConfig = await executeBuildConfig(configFunction!, 'api', context);
		expect(apiConfig.plugins).toBeUndefined();

		console.log('API phase config:', apiConfig);

		// Execute for 'web' phase - should include Tailwind plugin
		const webConfig = await executeBuildConfig(configFunction!, 'web', context);
		expect(webConfig.plugins).toBeDefined();
		expect(Array.isArray(webConfig.plugins)).toBe(true);
		expect(webConfig.plugins!.length).toBe(1);

		console.log('Web phase config:', webConfig);

		// Verify the plugin has the required BunPlugin shape
		const plugin = webConfig.plugins![0];
		expect(plugin).toBeDefined();
		expect(typeof plugin).toBe('object');
		expect('name' in plugin).toBe(true);
		expect(plugin.name).toBe('@tailwindcss/bun'); // The actual plugin name

		console.log('Tailwind plugin verified:', {
			name: plugin.name,
			hasSetup: 'setup' in plugin,
		});

		// Test merge with base config
		const baseConfig: import('bun').BuildConfig = {
			entrypoints: ['test.js'],
			outdir: outDir,
			target: 'browser',
			plugins: [{ name: 'base-plugin', setup: () => {} }],
		};

		const merged = mergeBuildConfig(baseConfig, webConfig);

		// Verify plugins were merged (base plugin + tailwind)
		expect(merged.plugins).toBeDefined();
		expect(Array.isArray(merged.plugins)).toBe(true);
		expect(merged.plugins!.length).toBe(2);
		expect(merged.plugins![0].name).toBe('base-plugin');
		expect(merged.plugins![1].name).toBe('@tailwindcss/bun');

		console.log('Merged config verified:', {
			pluginCount: merged.plugins!.length,
			pluginNames: merged.plugins!.map((p) => p.name),
		});

		// Clean up
		rmSync(testDir, { recursive: true, force: true });
	});

	test('verifies Tailwind plugin structure', async () => {
		// Import tailwindcss plugin directly to verify its structure
		const tailwindcss = (await import('bun-plugin-tailwind')).default;

		console.log('Tailwind plugin imported:', {
			type: typeof tailwindcss,
			isObject: typeof tailwindcss === 'object',
			hasName: 'name' in tailwindcss,
			name: tailwindcss.name,
			hasSetup: 'setup' in tailwindcss,
			setupType: typeof tailwindcss.setup,
		});

		// Verify it's a BunPlugin
		expect(typeof tailwindcss).toBe('object');
		expect('name' in tailwindcss).toBe(true);
		expect('setup' in tailwindcss).toBe(true);
		expect(typeof tailwindcss.setup).toBe('function');
		expect(tailwindcss.name).toBe('@tailwindcss/bun'); // The actual plugin name
	});

	test('demonstrates plugin execution in build config', async () => {
		// Create a test plugin that tracks when it's called
		const testPlugin = {
			name: 'test-plugin',
			setup(_build: { config: Partial<import('bun').BuildConfig> }) {
				// Plugin setup would be called by Bun.build()
			},
		};

		// Simulate what happens in the bundler
		const baseConfig: import('bun').BuildConfig = {
			entrypoints: ['test.js'],
			outdir: '/tmp/test',
			target: 'browser',
			plugins: [],
		};

		const userConfig = {
			plugins: [testPlugin],
		};

		const merged = mergeBuildConfig(baseConfig, userConfig);

		// Verify plugin was added
		expect(merged.plugins).toBeDefined();
		expect(merged.plugins!.length).toBe(1);
		expect(merged.plugins![0]).toBe(testPlugin);

		console.log('Plugin integration verified:', {
			pluginInMerged: merged.plugins![0].name,
			pluginCount: merged.plugins!.length,
		});

		// NOTE: We can't actually call the plugin setup here without a real Bun.build()
		// But we've verified the plugin structure is correct and would be passed to Bun.build()
	});
});
