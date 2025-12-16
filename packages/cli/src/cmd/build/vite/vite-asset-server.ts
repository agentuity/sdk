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
}

/**
 * Start Vite asset server on a dynamically-chosen port
 * Returns the server instance and the actual port number
 */
export async function startViteAssetServer(
	options: StartViteAssetServerOptions
): Promise<ViteAssetServerResult> {
	const { rootDir, logger } = options;

	logger.debug('Starting Vite asset server (HMR only)...');

	// Generate minimal config for asset serving
	const config = await generateAssetServerConfig({ rootDir, logger });

	// Create Vite server
	const server = await createServer(config);

	// Start listening - Vite will choose an available port
	await server.listen();

	// Extract the actual port Vite chose
	const port = server.config.server.port || 5173; // Fallback to Vite default

	logger.info(`✅ Vite asset server started on port ${port}`);
	logger.debug(`Asset server will handle: HMR, React transformation, source maps`);

	return { server, port };
}
