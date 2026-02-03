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
import { generatePatches } from '../patch';
import type { PatchModule } from '../patch/_util';

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
 * Serialize patches to a format that can be embedded in the preload script.
 * We need to serialize the patch data as JSON since the preload script
 * runs in the user's project context where @agentuity/cli is not available.
 */
function serializePatchesForPreload(patches: Map<string, PatchModule>): string {
	const patchArray: Array<{ name: string; patch: PatchModule }> = [];
	for (const [name, patch] of patches) {
		patchArray.push({ name, patch });
	}
	return JSON.stringify(patchArray, null, 2);
}

/**
 * Generate the preload script for LLM patches
 * This script registers a Bun plugin that intercepts LLM SDK imports
 * and applies patches for AI Gateway routing at runtime.
 *
 * The patch data is generated at dev server startup time and serialized
 * into the preload script, so it doesn't need to import from @agentuity/cli.
 */
async function generatePreloadScript(rootDir: string, logger: Logger): Promise<string> {
	const preloadPath = join(rootDir, '.agentuity', 'preload.ts');

	// Generate patches at dev server startup time
	const patches = generatePatches();
	const serializedPatches = serializePatchesForPreload(patches);

	logger.debug('Generated %d patches for preload script', patches.size);

	const preloadScript = `/**
 * Agentuity Dev Mode Preload Script
 * Auto-generated - do not edit
 *
 * This script registers the LLM patch plugin before any modules are loaded.
 * It enables AI Gateway routing and OpenTelemetry instrumentation in dev mode.
 */

import { plugin } from 'bun';

// Patch data generated at dev server startup time
// This is serialized from the CLI's patch generation logic
const patchData: Array<{ name: string; patch: PatchModule }> = ${serializedPatches};

interface PatchFunctionAction {
  before?: string;
  after?: string;
}

interface PatchModule {
  module: string;
  filename?: string;
  functions?: Record<string, PatchFunctionAction>;
  body?: PatchFunctionAction;
}

/**
 * Search backwards in a string for a character
 */
function searchBackwards(contents: string, offset: number, val: string): number {
  for (let i = offset; i >= 0; i--) {
    if (contents.charAt(i) === val) {
      return i;
    }
  }
  return -1;
}

/**
 * Apply a patch to file contents
 * This is a copy of the applyPatch function from the CLI's patch module
 */
async function applyPatch(
  filename: string,
  patch: PatchModule
): Promise<[string, 'js' | 'ts']> {
  let contents = await Bun.file(filename).text();
  const isJS = filename.endsWith('.js') || filename.endsWith('.mjs');
  let suffix = '';
  if (patch.functions) {
    for (const fn of Object.keys(patch.functions)) {
      const mod = patch.functions[fn];
      if (!mod) {
        continue;
      }
      let fnname = \`function \${fn}\`;
      let index = contents.indexOf(fnname);
      let isConstVariable = false;
      if (index === -1) {
        fnname = 'const ' + fn + ' = ';
        index = contents.indexOf(fnname);
        isConstVariable = true;
        if (index === -1) {
          continue;
        }
      }
      const eol = searchBackwards(contents, index, '\\n');
      if (eol < 0) {
        continue;
      }
      const prefix = contents.substring(eol + 1, index).trim();
      const isAsync = prefix.includes('async');
      const isExport = prefix.includes('export');
      const newname = '__agentuity_' + fn;
      let newfnname: string;
      if (isConstVariable) {
        newfnname = 'const ' + newname + ' = ';
      } else {
        newfnname = 'function ' + newname;
      }
      let fnprefix = '';
      if (isAsync) {
        fnprefix = 'async ';
      }
      if (isExport) {
        fnprefix += 'export ' + fnprefix;
      }
      contents = contents.replace(fnname, newfnname);
      if (isJS) {
        suffix += fnprefix + 'function ' + fn + '() {\\n';
        suffix += 'let args = arguments;\\n';
      } else {
        suffix += fnprefix + fnname + '(...args) {\\n';
      }
      suffix += '\\tlet _args = args;\\n';

      if (mod.before) {
        suffix += mod.before;
        suffix += '\\n';
      }

      if (isJS) {
        // For JS: use .apply to preserve 'this' context
        suffix += '\\tlet result = ' + newname + '.apply(this, _args);\\n';
      } else {
        // For TS: use spread operator
        suffix += '\\tlet result = ' + newname + '(..._args);\\n';
      }

      if (isAsync) {
        suffix += '\\tif (result instanceof Promise) {\\n';
        suffix += '\\t\\tresult = await result;\\n';
        suffix += '\\t}\\n';
      }
      if (mod.after) {
        suffix += mod.after;
        suffix += '\\n';
      }
      suffix += '\\treturn result;\\n';
      suffix += '}\\n';
      contents = contents + '\\n' + suffix;
    }
  }
  if (patch.body?.before) {
    contents = patch.body.before + '\\n' + contents;
  }
  if (patch.body?.after) {
    contents = contents + '\\n' + patch.body.after;
  }
  return [contents, isJS ? 'js' : 'ts'];
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
}

plugin({
  name: 'agentuity:runtime-patch',
  setup(build) {
    for (const { name, patch } of patchData) {
      // Build regex to match the module path in node_modules
      let modulePath: string;
      const escapedModule = escapeRegex(patch.module);
      if (patch.filename) {
        // Match specific file within the module
        modulePath = 'node_modules[/\\\\\\\\]' + escapedModule + '[/\\\\\\\\]' + patch.filename + '\\\\.(js|mjs|ts)$';
      } else {
        // Match index file of the module
        const lastPart = patch.module.split('/').pop() || patch.module;
        modulePath = 'node_modules[/\\\\\\\\]' + escapedModule + '[/\\\\\\\\](dist[/\\\\\\\\])?(index|' + lastPart + ')\\\\.(js|mjs|ts)$';
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
