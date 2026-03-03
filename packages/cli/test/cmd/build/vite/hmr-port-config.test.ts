import { describe, test, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAssetServerConfig } from '../../../../src/cmd/build/vite/vite-asset-server-config';
import type { Logger } from '../../../../src/types';

/**
 * Test suite for HMR port configuration
 *
 * This verifies that the HMR configuration supports both local development
 * and remote access through tunnels (*.agentuity.live).
 *
 * GitHub Issues:
 * - https://github.com/agentuity/sdk/issues/542 (port fallback)
 * - https://github.com/agentuity/sdk/issues/832 (tunnel HMR support)
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

	test('HMR config should use path-based routing for tunnel support', async () => {
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

			// HMR should use a dedicated path for WebSocket proxying through tunnels
			// This allows the Bun server to proxy HMR connections to Vite
			expect(hmrConfig.path).toBe('/__vite_hmr');

			// HMR port, clientPort, host, and protocol should NOT be set
			// This allows Vite to auto-detect from the page origin, enabling
			// HMR to work both locally and through the Gravity tunnel
			expect(hmrConfig.port).toBeUndefined();
			expect(hmrConfig.clientPort).toBeUndefined();
			expect(hmrConfig.host).toBeUndefined();
			expect(hmrConfig.protocol).toBeUndefined();
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
