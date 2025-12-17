/**
 * Vite Asset Server
 *
 * Starts a minimal Vite dev server for frontend asset transformation and HMR only.
 * Does NOT handle API routes or WebSocket - the Bun server proxies to this.
 */

import { createServer, type ViteDevServer } from 'vite';
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
	const port = 5173;

	// Generate minimal config with the port configured
	const config = await generateAssetServerConfig({ rootDir, logger, workbenchPath, port });

	// Create Vite server with config
	const server = await createServer(config);

	// Start listening on the configured port
	await server.listen();

	logger.info(`✅ Vite asset server started on port ${port}`);
	logger.debug(`Asset server will handle: HMR, React transformation, source maps`);
	logger.debug(`HMR WebSocket configured to connect to ws://127.0.0.1:${port}`);

	return { server, port };
}
