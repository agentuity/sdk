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
 *
 * IMPORTANT: This function assumes that the dev bundle has already been built:
 * - Entry file generated at src/generated/app.ts (with workbench config if enabled)
 * - Bundled to .agentuity/app.js with LLM patches applied
 *
 * The bundle is loaded here to ensure AI Gateway routing patches are active.
 * Vite port is read from process.env.VITE_PORT at runtime.
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, logger, vitePort } = options;

	logger.debug('Starting Bun dev server (Vite already running on port %d)...', vitePort);

	// Load the bundled app - this will start Bun.serve() internally
	// IMPORTANT: We must import the bundled .agentuity/app.js (NOT src/generated/app.ts)
	// because the bundled version has LLM provider patches applied that enable AI Gateway routing.
	// Importing the source file directly would bypass these patches.
	logger.debug('📦 Loading bundled app (Bun server will start)...');
	const appPath = `${rootDir}/.agentuity/app.js`;

	// Verify bundle exists before attempting to load
	const appFile = Bun.file(appPath);
	if (!(await appFile.exists())) {
		throw new Error(
			`Dev bundle not found at ${appPath}. The bundle must be generated before starting the dev server.`
		);
	}

	// Clear Bun's module cache for the bundled app to ensure fresh code is loaded.
	// This is essential for hot reload to work - otherwise Bun returns the cached module
	// and the server continues serving stale code.
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const bunAny = Bun as any;
		// Try multiple possible locations for the loader registry
		const loader = bunAny.loader ?? bunAny.Loader ?? bunAny.Main;
		const registry = loader?.registry ?? loader?.Registry;
		if (registry?.delete) {
			logger.debug('Clearing Bun module cache for: %s', appPath);
			registry.delete(appPath);
		} else if (typeof loader?.clearModuleCache === 'function') {
			// Alternative API that may exist in some Bun versions
			logger.debug('Clearing Bun module cache via clearModuleCache: %s', appPath);
			loader.clearModuleCache(appPath);
		} else {
			logger.debug(
				'Bun module cache API not available - module may be cached. Available loader keys: %s',
				loader ? Object.keys(loader).join(', ') : 'none'
			);
		}
	} catch (err) {
		logger.warn(
			'Failed to clear Bun module cache for %s: %s. Server restart may serve stale code.',
			appPath,
			err instanceof Error ? err.message : String(err)
		);
	}

	// Set PORT env var so the generated app uses the correct port
	process.env.PORT = String(port);

	// Import the generated app using the canonical file path
	try {
		await import(appPath);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to import generated app from %s: %s', appPath, errorMessage);
		throw new Error(`Failed to load generated app: ${errorMessage}`);
	}

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
