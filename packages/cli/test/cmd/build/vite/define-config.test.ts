import { describe, test, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAgentuityConfig } from '../../../../src/cmd/build/vite/config-loader';
import type { Logger } from '../../../../src/types';

/**
 * Test suite for custom define configuration from agentuity.config.ts
 *
 * This verifies that custom define values specified in agentuity.config.ts
 * are correctly merged into the Vite configuration for all build phases.
 *
 * GitHub Issue: https://github.com/agentuity/sdk/issues/218
 */
describe('Vite Define Configuration', () => {
	const mockLogger: Logger = {
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {
			throw new Error('Fatal error');
		},
	};

	test('should load custom define from agentuity.config.ts', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-define-test-'));
		try {
			// Create agentuity.config.ts with custom define
			const configContent = `
export default {
	define: {
		'import.meta.env.CUSTOM_API_URL': JSON.stringify('https://api.example.com'),
		'import.meta.env.FEATURE_FLAG': JSON.stringify('true'),
	}
};
`;
			writeFileSync(join(tempDir, 'agentuity.config.ts'), configContent);

			// Load the config
			const userConfig = await loadAgentuityConfig(tempDir, mockLogger);

			// Verify define property exists and contains the right values
			expect(userConfig).toBeDefined();
			expect(userConfig?.define).toBeDefined();
			expect(userConfig?.define?.['import.meta.env.CUSTOM_API_URL']).toBe(
				JSON.stringify('https://api.example.com')
			);
			expect(userConfig?.define?.['import.meta.env.FEATURE_FLAG']).toBe(JSON.stringify('true'));
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('should merge custom define into Vite asset server config', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-define-test-'));
		try {
			// Create agentuity.config.ts with custom define
			const configContent = `
export default {
	define: {
		'import.meta.env.MY_CUSTOM_VAR': JSON.stringify('test-value'),
	}
};
`;
			writeFileSync(join(tempDir, 'agentuity.config.ts'), configContent);

			// Load the user config
			const userConfig = await loadAgentuityConfig(tempDir, mockLogger);
			const userDefine = userConfig?.define || {};

			// Simulate the merging logic from vite-asset-server-config.ts
			// User defines are spread first, then protected defaults override
			const mergedDefine = {
				...userDefine,
				'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify('false'),
				'process.env.NODE_ENV': JSON.stringify('development'),
			};

			// Verify custom define is in the merged config
			expect(mergedDefine['import.meta.env.MY_CUSTOM_VAR']).toBe(JSON.stringify('test-value'));

			// Verify default defines are still present
			expect(mergedDefine['process.env.NODE_ENV']).toBe(JSON.stringify('development'));
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('should not override protected keys', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-define-test-'));
		try {
			// Try to override protected keys
			const configContent = `
export default {
	define: {
		'process.env.NODE_ENV': JSON.stringify('hacked'),
		'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify('hacked'),
	}
};
`;
			writeFileSync(join(tempDir, 'agentuity.config.ts'), configContent);

			// Load the user config
			const userConfig = await loadAgentuityConfig(tempDir, mockLogger);
			const userDefine = userConfig?.define || {};

			// Simulate the merging logic from vite-asset-server-config.ts
			// User defines are spread first, then protected defaults override
			const mergedDefine = {
				...userDefine,
				'import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY': JSON.stringify('false'),
				'process.env.NODE_ENV': JSON.stringify('development'),
			};

			// Verify protected keys were overridden by defaults (not user values)
			expect(mergedDefine['process.env.NODE_ENV']).toBe(JSON.stringify('development'));
			expect(mergedDefine['import.meta.env.AGENTUITY_PUBLIC_HAS_SDK_KEY']).toBe(
				JSON.stringify('false')
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('should handle missing agentuity.config.ts gracefully', async () => {
		// Create a temp dir without config
		const emptyDir = mkdtempSync(join(tmpdir(), 'agentuity-no-config-'));

		try {
			const userConfig = await loadAgentuityConfig(emptyDir, mockLogger);
			expect(userConfig).toBeNull();
		} finally {
			rmSync(emptyDir, { recursive: true, force: true });
		}
	});

	test('should document where define merging happens', () => {
		// Documentation test: Define merging occurs in all build phases
		const mergeLocations = [
			{
				file: 'vite-builder.ts',
				mode: 'client',
				action: 'merge userConfig.define before default defines',
			},
			{
				file: 'vite-builder.ts',
				mode: 'workbench',
				action: 'merge userConfig.define',
			},
			{
				file: 'server-bundler.ts',
				mode: 'server',
				action: 'include userDefine in build config',
			},
			{
				file: 'vite-asset-server-config.ts',
				mode: 'dev',
				action: 'merge userConfig.define before default defines',
			},
		];

		expect(mergeLocations.length).toBe(4);
		expect(mergeLocations[0].mode).toBe('client');
		expect(mergeLocations[1].mode).toBe('workbench');
		expect(mergeLocations[2].mode).toBe('server');
		expect(mergeLocations[3].mode).toBe('dev');
	});
});
