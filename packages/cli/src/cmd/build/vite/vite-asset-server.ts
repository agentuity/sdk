/**
 * Vite Asset Server
 *
 * Starts a minimal Vite dev server for frontend asset transformation and HMR only.
 * Does NOT handle API routes or WebSocket - the Bun server proxies to this.
 */

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

	// Dynamically import vite
	const { createServer } = await import('vite');

	// Create Vite server with config
	const server = await createServer(config);

	// Start listening - Vite will choose alternate port if preferred is taken
	await server.listen();

	// Get the actual port Vite is using (may differ from preferred if port was taken)
	const actualPort = server.config.server.port || preferredPort;

	logger.debug(`✅ Vite asset server started on port ${actualPort}`);
	if (actualPort !== preferredPort) {
		logger.debug(`Port ${preferredPort} was taken, using ${actualPort} instead`);
	}
	logger.debug(`Asset server will handle: HMR, React transformation, source maps`);
	logger.debug(`HMR WebSocket configured to connect to ws://127.0.0.1:${actualPort}`);

	return { server, port: actualPort };
}
