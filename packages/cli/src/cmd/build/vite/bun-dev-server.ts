/**
 * Bun Dev Server
 *
 * Runs Bun server that handles ALL app logic (HTTP + WebSocket) and proxies
 * frontend asset requests to Vite asset server for HMR support.
 */

import type { Logger } from '../../../types';

export interface BunDevServerOptions {
	rootDir: string;
	port?: number;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logger: Logger;
	vitePort: number; // Port of already-running Vite asset server
}

export interface BunDevServerResult {
	bunServerPort: number;
}

/**
 * Start Bun dev server (Vite asset server must already be running)
 * Generates entry file with proxy routes pointing to Vite
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, projectId = '', deploymentId = '', logger, vitePort } = options;

	logger.debug('Starting Bun dev server (Vite already running on port %d)...', vitePort);

	// Generate workbench source files if enabled (dev mode)
	const { loadAgentuityConfig, getWorkbenchConfig } = await import('./config-loader');
	const config = await loadAgentuityConfig(rootDir, logger);
	const workbenchConfig = getWorkbenchConfig(config, true); // dev mode

	if (workbenchConfig.enabled) {
		logger.debug('Workbench enabled (dev mode), generating source files...');
		const { generateWorkbenchFiles } = await import('./workbench-generator');
		await generateWorkbenchFiles(rootDir, projectId, workbenchConfig, logger);
	}

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
	const appPath = `${rootDir}/src/generated/app.ts`;

	// Clear Bun's module cache for the generated app to ensure fresh code is loaded.
	// This is essential for hot reload to work - otherwise Bun returns the cached module
	// and the server continues serving stale code.
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const bunAny = Bun as any;
		const loader = bunAny.loader ?? bunAny.Loader;
		if (loader?.registry?.delete) {
			logger.debug('Clearing loader cache for %s', appPath);
			loader.registry.delete(appPath);
		}
	} catch (err) {
		logger.debug('Failed to clear Bun module cache for %s: %s', appPath, err);
	}

	// Set PORT env var so the generated app uses the correct port
	process.env.PORT = String(port);

	// Use a unique specifier to force fresh evaluation (cache-busting fallback)
	// Even if loader.registry.delete() worked, this provides extra insurance
	const appSpecifier = `${appPath}?ts=${Date.now()}`;
	await import(appSpecifier);

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

	logger.debug(`Bun dev server started on http://127.0.0.1:${port}`);
	logger.debug(`Asset requests (/@vite/*, /src/web/*, etc.) proxied to Vite:${vitePort}`);

	return {
		bunServerPort: port,
	};
}
