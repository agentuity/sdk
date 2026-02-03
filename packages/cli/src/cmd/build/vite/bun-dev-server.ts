/**
 * Bun Dev Server with Native Hot Reload
 *
 * Runs Bun server that handles ALL app logic (HTTP + WebSocket) and proxies
 * frontend asset requests to Vite asset server for HMR support.
 *
 * NEW: Uses Bun's native --hot flag for instant hot module replacement,
 * eliminating the need for bundling in dev mode. LLM patches are applied
 * at runtime via a preload script.
 */

import { join } from 'node:path';
import type { Logger } from '../../../types';

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
}

export interface BunDevServerResult {
	bunServerPort: number;
}

/**
 * Generate the preload script for LLM patches
 * This script registers a Bun plugin that intercepts LLM SDK imports
 * and applies patches for AI Gateway routing at runtime.
 */
async function generatePreloadScript(rootDir: string, logger: Logger): Promise<string> {
	const preloadPath = join(rootDir, '.agentuity', 'preload.ts');

	const preloadScript = `/**
 * Agentuity Dev Mode Preload Script
 * Auto-generated - do not edit
 *
 * This script registers the LLM patch plugin before any modules are loaded.
 * It enables AI Gateway routing and OpenTelemetry instrumentation in dev mode.
 */

import { plugin } from 'bun';
import { generatePatches, applyPatch } from '@agentuity/cli/cmd/build/patch';

const patches = generatePatches();

plugin({
  name: 'agentuity:runtime-patch',
  setup(build) {
    for (const [name, patch] of patches) {
      // Build regex to match the module path in node_modules
      let modulePath: string;
      if (patch.filename) {
        // Match specific file within the module
        const escapedModule = patch.module.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        modulePath = \`node_modules[/\\\\\\\\]\${escapedModule}[/\\\\\\\\]\${patch.filename}\\\\.(js|mjs|ts)$\`;
      } else {
        // Match index file of the module
        const escapedModule = patch.module.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        const lastPart = patch.module.split('/').pop();
        modulePath = \`node_modules[/\\\\\\\\]\${escapedModule}[/\\\\\\\\](dist[/\\\\\\\\])?(index|\${lastPart})\\\\.(js|mjs|ts)$\`;
      }

      const filter = new RegExp(modulePath);

      build.onLoad({ filter, namespace: 'file' }, async (args) => {
        try {
          const [contents, loader] = await applyPatch(args.path, patch);
          return { contents, loader };
        } catch {
          // If patching fails, let Bun handle the file normally
          return undefined;
        }
      });
    }
  },
});
`;

	// Ensure .agentuity directory exists
	const agentuityDir = join(rootDir, '.agentuity');
	await Bun.write(join(agentuityDir, '.gitkeep'), '');

	// Write the preload script
	await Bun.write(preloadPath, preloadScript);
	logger.debug('Generated preload script at %s', preloadPath);

	return preloadPath;
}

/**
 * Start Bun dev server with native hot reload (Vite asset server must already be running)
 *
 * NEW ARCHITECTURE (no bundling):
 * - Entry file generated at src/generated/app.ts (with workbench config if enabled)
 * - TypeScript is run directly with Bun (no bundling step)
 * - LLM patches applied at runtime via preload script
 * - Bun's --hot flag enables native hot module replacement
 *
 * This eliminates the bundling step entirely, providing:
 * - Instant startup (no bundling)
 * - True HMR via Bun's native --hot flag
 * - Better debugging with original source files
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, logger, vitePort, inspect, inspectWait, inspectBrk } = options;

	logger.debug('Starting Bun dev server with native hot reload (Vite on port %d)...', vitePort);

	// Entry point is the generated TypeScript file (not bundled)
	const appPath = join(rootDir, 'src/generated/app.ts');

	// Verify entry point exists
	const appFile = Bun.file(appPath);
	if (!(await appFile.exists())) {
		throw new Error(`Entry file not found at ${appPath}. Run code generation first.`);
	}

	// Generate preload script for LLM patches
	const preloadPath = await generatePreloadScript(rootDir, logger);

	// Set PORT env var so the generated app uses the correct port
	process.env.PORT = String(port);

	// Build command arguments - always spawn as subprocess with --hot
	const args: string[] = ['bun'];

	// Add debugger flag if enabled (priority: inspectBrk > inspectWait > inspect)
	if (inspectBrk) {
		args.push('--inspect-brk');
		logger.debug('Using debugger flag: --inspect-brk');
	} else if (inspectWait) {
		args.push('--inspect-wait');
		logger.debug('Using debugger flag: --inspect-wait');
	} else if (inspect) {
		args.push('--inspect');
		logger.debug('Using debugger flag: --inspect');
	}

	// Add hot reload flag for native HMR
	args.push('--hot');

	// Add preload script for LLM patches (AI Gateway routing)
	args.push('--preload', preloadPath);

	// Add the entry point
	args.push('run', appPath);

	logger.debug('Spawning: %s', args.join(' '));

	// Spawn the Bun process
	const bunProcess = Bun.spawn(args, {
		cwd: rootDir,
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...process.env,
			PORT: String(port),
			VITE_PORT: String(vitePort),
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

		// Check if process exited unexpectedly
		if (bunProcess.exitCode !== null) {
			throw new Error(
				`Bun process exited with code ${bunProcess.exitCode} before server started`
			);
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

	logger.debug(`Bun dev server started on http://127.0.0.1:${port} with hot reload`);
	logger.debug(`Asset requests (/@vite/*, /src/web/*, etc.) proxied to Vite:${vitePort}`);
	logger.debug(`LLM patches applied via preload script (AI Gateway routing enabled)`);

	return {
		bunServerPort: port,
	};
}
