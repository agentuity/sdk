/**
 * Vite Asset Server
 *
 * Starts a minimal Vite dev server for frontend asset transformation and HMR only.
 * Does NOT handle API routes or WebSocket - the Bun server proxies to this.
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { ViteDevServer } from 'vite';
import type { Logger } from '../../../types';
import { generateAssetServerConfig } from './vite-asset-server-config';

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
 * Start Vite asset server on a dynamically-chosen port
 * Returns the server instance and the actual port number
 */
export async function startViteAssetServer(
	options: StartViteAssetServerOptions
): Promise<ViteAssetServerResult> {
	const { rootDir, logger, workbenchPath } = options;

	logger.debug('Starting Vite asset server (HMR only)...');

	// Pick a port for Vite asset server (try 5173 first, Vite default)
	// strictPort: false allows Vite to choose alternate if 5173 is taken
	const preferredPort = 5173;

	// Generate minimal config with preferred port
	const config = await generateAssetServerConfig({
		rootDir,
		logger,
		workbenchPath,
		port: preferredPort,
	});

	// Dynamically import vite from the project's node_modules
	// This ensures we resolve from the target project directory, not the CWD
	const projectRequire = createRequire(join(rootDir, 'package.json'));
	const { createServer } = await import(projectRequire.resolve('vite'));

	// Create Vite server with config
	const server = await createServer(config);

	// Start listening with timeout to prevent hangs
	// Vite will choose alternate port if preferred is taken
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

	// Helper to get port from httpServer
	const getPortFromHttpServer = (): number | null => {
		const httpServer = server.httpServer;
		if (httpServer) {
			const address = httpServer.address();
			if (address && typeof address === 'object' && 'port' in address) {
				return address.port;
			}
		}
		return null;
	};

	// Get the actual port Vite is using from the httpServer
	// server.config.server.port is the requested port, not the actual one
	let actualPort = preferredPort;

	// The resolved URL contains the actual port being used
	const resolvedUrls = server.resolvedUrls;
	if (resolvedUrls?.local && resolvedUrls.local.length > 0) {
		try {
			const url = new URL(resolvedUrls.local[0]);
			actualPort = parseInt(url.port, 10) || preferredPort;
		} catch {
			actualPort = getPortFromHttpServer() ?? preferredPort;
		}
	} else {
		actualPort = getPortFromHttpServer() ?? preferredPort;
	}

	logger.debug(`✅ Vite asset server started on port ${actualPort}`);
	if (actualPort !== preferredPort) {
		logger.debug(`Port ${preferredPort} was taken, using ${actualPort} instead`);
	}
	logger.debug(`Asset server will handle: HMR, React transformation, source maps`);
	logger.debug(`HMR WebSocket configured to connect to ws://127.0.0.1:${actualPort}`);

	return { server, port: actualPort };
}
