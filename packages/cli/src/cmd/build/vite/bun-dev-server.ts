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
	viteAssetServer: { server: any; port: number };
	bunServerPort: number;
}

/**
 * Start Bun dev server with Vite asset server for HMR
 */
export async function startBunDevServer(
	options: BunDevServerOptions
): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, projectId = '', orgId = '', deploymentId = '', logger } = options;

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
	logger.info('🎨 Starting Vite asset server for HMR...');
	const viteAssetServer = await startViteAssetServer({ rootDir, logger });
	const vitePort = viteAssetServer.port;

	// Step 2: Generate entry file with Vite port for asset proxying
	logger.info('📝 Generating entry file with asset proxy configuration...');
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
	logger.info('📦 Loading generated app (Bun server will start)...');
	const appPath = `${rootDir}/.agentuity/app.generated.ts`;
	await import(appPath);

	logger.info(`✅ Bun dev server started on http://127.0.0.1:${port}`);
	logger.debug(`Asset requests (/@vite/*, /src/web/*, etc.) proxied to Vite:${vitePort}`);

	return {
		viteAssetServer,
		bunServerPort: port,
	};
}
