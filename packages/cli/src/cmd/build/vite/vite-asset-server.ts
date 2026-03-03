/**
 * Vite Asset Server
 *
 * Starts a minimal Vite dev server for frontend asset transformation and HMR only.
 * Does NOT handle API routes or WebSocket - the Bun server proxies to this.
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import type { ViteDevServer } from 'vite';
import type { Logger } from '../../../types.ts';
import { generateAssetServerConfig } from './vite-asset-server-config.ts';

export interface ViteAssetServerResult {
	server: ViteDevServer;
	port: number;
}

export interface StartViteAssetServerOptions {
	rootDir: string;
	logger: Logger;
	workbenchPath?: string;
}

/**
 * Check if a specific port is available on the given host.
 */
function isPortAvailable(port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createNetServer();
		server.once('error', () => {
			resolve(false);
		});
		server.listen(port, host, () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
}

/**
 * Find an available port starting from the preferred port.
 * Tries incrementing ports up to maxAttempts times.
 */
async function findAvailablePort(
	preferredPort: number,
	host: string = '127.0.0.1',
	maxAttempts: number = 20
): Promise<number> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const port = preferredPort + attempt;
		const available = await isPortAvailable(port, host);
		if (available) {
			return port;
		}
	}
	throw new Error(
		`Could not find an available port after ${maxAttempts} attempts starting from ${preferredPort}`
	);
}

/**
 * Start Vite asset server on a dynamically-chosen port
 * Returns the server instance and the actual port number
 */
export async function startViteAssetServer(
	options: StartViteAssetServerOptions
): Promise<ViteAssetServerResult> {
	const { rootDir, logger, workbenchPath } = options;

	logger.debug('Starting Vite asset server (HMR only)...');

	// Find an available port before starting Vite
	// This avoids relying on Vite's strictPort:false fallback which can fail
	const preferredPort = 5173;
	const availablePort = await findAvailablePort(preferredPort, '127.0.0.1');

	if (availablePort !== preferredPort) {
		logger.info(
			`Port ${preferredPort} is in use, using port ${availablePort} for Vite asset server`
		);
	}

	// Generate minimal config with the available port
	const config = await generateAssetServerConfig({
		rootDir,
		logger,
		workbenchPath,
		port: availablePort,
	});

	// Dynamically import vite from the project's node_modules
	// This ensures we resolve from the target project directory, not the CWD
	const projectRequire = createRequire(join(rootDir, 'package.json'));
	const { createServer } = await import(projectRequire.resolve('vite'));

	// Create Vite server with config
	const server = await createServer(config);

	// Start listening with timeout to prevent hangs
	const STARTUP_TIMEOUT_MS = 30000; // 30 seconds

	try {
		await Promise.race([
			server.listen(),
			new Promise<never>((_, reject) => {
				const timeoutId = setTimeout(() => {
					reject(
						new Error(
							`Vite asset server failed to start within ${STARTUP_TIMEOUT_MS / 1000}s`
						)
					);
				}, STARTUP_TIMEOUT_MS);
				// Clean up timeout when listen succeeds (via finally in the outer try)
				server.httpServer?.once('listening', () => clearTimeout(timeoutId));
			}),
		]);
	} catch (error) {
		// Attempt to close the server on failure
		try {
			await server.close();
		} catch {
			// Ignore close errors
		}
		throw error;
	}

	// Port was pre-verified and strictPort:true ensures Vite uses exactly this port
	const actualPort = availablePort;

	logger.info(`Vite asset server running on port ${actualPort}`);
	logger.debug(`Asset server will handle: HMR, React transformation, source maps`);
	logger.debug(
		`HMR WebSocket configured at /__vite_hmr (proxied through Bun server for tunnel support)`
	);

	return { server, port: actualPort };
}
