/**
 * Bun Dev Server
 *
 * Runs Bun server that handles ALL app logic (HTTP + WebSocket) and proxies
 * frontend asset requests to Vite asset server for HMR support.
 */

import type { Logger } from '../../../types';
import { startViteAssetServer } from './vite-asset-server';

export interface BunDevServerOptions {
	rootDir: string;
	port?: number;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logger: Logger;
}

export interface BunDevServerResult {
	viteAssetServer: { server: { close: () => void | Promise<void> }; port: number };
	bunServerPort: number;
}

/**
 * Start Bun dev server with Vite asset server for HMR
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, projectId = '', deploymentId = '', logger } = options;

	logger.debug('Starting Bun dev server with Vite asset server for HMR...');

	// Generate workbench source files if enabled (dev mode)
	const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(rootDir, logger);
	const workbenchConfig = getWorkbenchConfig(config, true); // dev mode

	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating source files...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
	}

	// Step 1: Start Vite asset server FIRST and get its dynamic port
	logger.debug('🎨 Starting Vite asset server for HMR...');
	const viteAssetServer = await startViteAssetServer({
		rootDir,
		logger,
		workbenchPath: workbenchConfig.enabled ? workbenchConfig.route : undefined,
	});
	const vitePort = viteAssetServer.port;

	// Step 2: Generate entry file with Vite port for asset proxying
	logger.debug('📝 Generating entry file with asset proxy configuration...');
	const { generateEntryFile } = await import('../entry-generator');
	await generateEntryFile({
		rootDir,
		projectId: projectId || '',
		deploymentId: deploymentId || '',
		logger,
		mode: 'dev',
		workbench: workbenchConfig.enabled ? workbenchConfig : undefined,
		vitePort, // Pass Vite port for proxy routes
	});

	// Step 3: Load the generated app - this will start Bun.serve() internally
	logger.debug('📦 Loading generated app (Bun server will start)...');
	const appPath = `${rootDir}/.agentuity/app.generated.ts`;

	// Set PORT env var so the generated app uses the correct port
	process.env.PORT = String(port);

	await import(appPath);

	// Wait for server to actually start listening
	// The generated app sets (globalThis as any).__AGENTUITY_SERVER__ when server starts
	const maxRetries = 50; // Increased retries for slower systems
	const retryDelay = 100; // ms
	let serverReady = false;

	for (let i = 0; i < maxRetries; i++) {
		// Check if global server object exists
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((globalThis as any).__AGENTUITY_SERVER__) {
			// Server object exists, now verify it's actually listening by making a request
			try {
				await fetch(`http://127.0.0.1:${port}/`, {
					method: 'HEAD',
					signal: AbortSignal.timeout(1000),
				});
				// Any response (even 404) means server is listening
				serverReady = true;
				break;
			} catch {
				// Connection refused or timeout - server not ready yet
			}
		}
		// Wait before next check
		await new Promise((resolve) => setTimeout(resolve, retryDelay));
	}

	if (!serverReady) {
		throw new Error(
			`Bun server failed to start on port ${port} after ${maxRetries * retryDelay}ms`
		);
	}

	logger.info(`✅ Bun dev server started on http://127.0.0.1:${port}`);
	logger.debug(`Asset requests (/@vite/*, /src/web/*, etc.) proxied to Vite:${vitePort}`);

	return {
		viteAssetServer,
		bunServerPort: port,
	};
}
