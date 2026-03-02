/**
 * Bun Dev Server
 *
 * Runs Bun server that handles ALL app logic (HTTP + WebSocket) and proxies
 * frontend asset requests to Vite asset server for HMR support.
 */

import type { Logger } from '../../../types';
import { getAgentEnv } from '../../../agent-detection';

export interface BunDevServerOptions {
	rootDir: string;
	port?: number;
	projectId?: string;
	orgId?: string;
	deploymentId?: string;
	logger: Logger;
	vitePort: number; // Port of already-running Vite asset server
	inspect?: boolean; // Enable bun debugger
	inspectWait?: boolean; // Enable bun debugger and wait for connection
	inspectBrk?: boolean; // Enable bun debugger with breakpoint at first line
	noBundle?: boolean; // Run src/generated/app.ts directly without bundling
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
 *
 * When debugger flags (inspect, inspectWait, inspectBrk) are passed, bun is spawned
 * as a subprocess to enable passing the debugger CLI flags.
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const {
		rootDir,
		port = 3500,
		logger,
		vitePort,
		inspect,
		inspectWait,
		inspectBrk,
		noBundle,
	} = options;

	logger.debug('Starting Bun dev server (Vite already running on port %d)...', vitePort);

	const appPath = noBundle ? `${rootDir}/src/generated/app.ts` : `${rootDir}/.agentuity/app.js`;

	// Verify entry file exists before attempting to load
	const appFile = Bun.file(appPath);
	if (!(await appFile.exists())) {
		throw new Error(
			noBundle
				? `Generated entry not found at ${appPath}. Run the dev command to generate it.`
				: `Dev bundle not found at ${appPath}. The bundle must be generated before starting the dev server.`
		);
	}

	// Set PORT env var so the generated app uses the correct port
	process.env.PORT = String(port);

	// Check if any debugger flag is enabled
	const useDebugger = inspect || inspectWait || inspectBrk;

	if (useDebugger) {
		// Spawn bun as subprocess with debugger flag
		logger.debug('📦 Spawning bun with debugger enabled...');

		// Determine which debugger flag to use (priority: inspectBrk > inspectWait > inspect)
		let debugFlag: string;
		if (inspectBrk) {
			debugFlag = '--inspect-brk';
		} else if (inspectWait) {
			debugFlag = '--inspect-wait';
		} else {
			debugFlag = '--inspect';
		}

		logger.debug('Using debugger flag: %s', debugFlag);

		const bunProcess = Bun.spawn(['bun', debugFlag, 'run', appPath], {
			cwd: rootDir,
			stdout: 'inherit',
			stderr: 'inherit',
			env: {
				...process.env,
				...getAgentEnv(),
				PORT: String(port),
			},
		});

		// Store the process globally so it can be killed on shutdown
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ = bunProcess;

		// Wait for server to actually start listening
		const maxRetries = 50;
		const retryDelay = 100;
		let serverReady = false;

		for (let i = 0; i < maxRetries; i++) {
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
			// Wait before next check
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
		}

		if (!serverReady) {
			// Kill the subprocess if server didn't start
			try {
				bunProcess.kill();
			} catch (err) {
				logger.debug('Error killing subprocess during startup failure: %s', err);
			}
			throw new Error(
				`Bun server failed to start on port ${port} after ${maxRetries * retryDelay}ms`
			);
		}

		logger.debug(`Bun dev server started on http://127.0.0.1:${port} with debugger enabled`);
		logger.debug(`Asset requests (/@vite/*, /src/web/*, etc.) proxied to Vite:${vitePort}`);
	} else {
		// Load the app entry - this will start Bun.serve() internally
		// In bundle mode: imports .agentuity/app.js (with build-time LLM patches)
		// In no-bundle mode: imports src/generated/app.ts directly (with runtime patches)
		logger.debug('Loading app from: %s (noBundle: %s)', appPath, !!noBundle);
		logger.debug('📦 Loading app entry (Bun server will start)...');

		// Import the generated app with cache-busting query parameter.
		// Bun's module cache is keyed by the full specifier including query string,
		// so adding a unique timestamp forces a fresh import on each reload.
		const cacheBuster = `?t=${Date.now()}`;
		try {
			await import(appPath + cacheBuster);
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
	}

	return {
		bunServerPort: port,
	};
}
