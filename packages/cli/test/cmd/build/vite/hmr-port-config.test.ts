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

	test('HMR should be enabled', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-hmr-test-'));
		try {
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: {} })
			);
			mkdirSync(join(tempDir, 'src'), { recursive: true });

			const config = await generateAssetServerConfig({
				rootDir: tempDir,
				logger: mockLogger,
				port: 5173,
				backendPort: 3500,
			});

			// HMR should be enabled
			expect(config.server?.hmr).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('server config should use strictPort: true (port pre-verified)', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-hmr-test-'));
		try {
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: {} })
			);
			mkdirSync(join(tempDir, 'src'), { recursive: true });

			const config = await generateAssetServerConfig({
				rootDir: tempDir,
				logger: mockLogger,
				port: 5173,
				backendPort: 3500,
			});

			// strictPort is true because findAvailablePort() pre-verifies the port
			expect(config.server?.strictPort).toBe(true);

			// The requested port should be set
			expect(config.server?.port).toBe(5173);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
