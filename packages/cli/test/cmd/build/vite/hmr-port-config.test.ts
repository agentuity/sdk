import { describe, test, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAssetServerConfig } from '../../../../src/cmd/build/vite/vite-asset-server-config';
import type { Logger } from '../../../../src/types';

/**
 * Test suite for HMR port configuration
 *
 * This verifies that the HMR configuration does not hardcode port values,
 * allowing Vite to automatically use the actual server port when it falls
 * back to an alternate port due to port conflicts.
 *
 * GitHub Issue: https://github.com/agentuity/sdk/issues/542
 */
describe('Vite HMR Port Configuration', () => {
	const mockLogger: Logger = {
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {
			throw new Error('Fatal error');
		},
		child: () => mockLogger,
	};

	test('HMR config should not hardcode port values', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-hmr-test-'));
		try {
			// Create minimal project structure
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: {} })
			);
			mkdirSync(join(tempDir, 'src'), { recursive: true });

			const config = await generateAssetServerConfig({
				rootDir: tempDir,
				logger: mockLogger,
				port: 5173,
			});

			// Verify HMR config exists
			expect(config.server?.hmr).toBeDefined();

			const hmrConfig = config.server?.hmr as Record<string, unknown>;

			// HMR port and clientPort should NOT be set
			// This allows Vite to use the actual server port when it falls back
			expect(hmrConfig.port).toBeUndefined();
			expect(hmrConfig.clientPort).toBeUndefined();

			// These should still be set for proper HMR routing
			expect(hmrConfig.protocol).toBe('ws');
			expect(hmrConfig.host).toBe('127.0.0.1');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('server config should allow port fallback with strictPort: false', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-hmr-test-'));
		try {
			// Create minimal project structure
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: {} })
			);
			mkdirSync(join(tempDir, 'src'), { recursive: true });

			const config = await generateAssetServerConfig({
				rootDir: tempDir,
				logger: mockLogger,
				port: 5173,
			});

			// strictPort should be false to allow Vite to choose alternate ports
			expect(config.server?.strictPort).toBe(false);

			// The requested port should still be set
			expect(config.server?.port).toBe(5173);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
