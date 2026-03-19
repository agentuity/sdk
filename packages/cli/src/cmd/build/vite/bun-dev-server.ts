/**
 * Bun Dev Server
 *
 * Spawns Bun with --hot as a subprocess. Bun's --hot mode re-evaluates changed
 * modules and hot-swaps the default export's `fetch` handler on the running
 * server — no process restart, no port rebind, no dropped connections.
 *
 * The user's app.ts exports the result of createApp() which includes `fetch`
 * and `port` properties that Bun uses to manage the server lifecycle.
 *
 * Key requirements for bun --hot:
 * - app.ts MUST have `export default` with { fetch, port } properties
 * - Without export default, Bun runs the code but never starts an HTTP server
 */

import type { Logger } from '../../../types';
import { getAgentEnv } from '../../../agent-detection';
import { createServer as createNetServer } from 'node:net';

export interface BunDevServerOptions {
	rootDir: string;
	port?: number;
	logger: Logger;
	vitePort: number;
	inspect?: boolean;
	inspectWait?: boolean;
	inspectBrk?: boolean;
}

export interface BunDevServerResult {
	bunServerPort: number;
}

/**
 * Check if a port is available for binding.
 * Returns true if the port is free, false if in use.
 */
function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createNetServer();
		server.once('error', () => {
			resolve(false);
		});
		server.listen(port, host, () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
}

/**
 * Kill any process listening on the specified port.
 * Uses lsof on Unix systems to find and kill the process.
 */
async function killProcessOnPort(
	port: number,
	logger: { debug: (msg: string, ...args: unknown[]) => void }
): Promise<boolean> {
	if (process.platform === 'win32') {
		// Windows: use netstat to find PID, then taskkill
		// This is more complex and less reliable, skip for now
		return false;
	}

	try {
		// Find PIDs listening on the port
		const result = Bun.spawnSync(['lsof', '-t', '-i', `:${port}`], {
			stdout: 'pipe',
			stderr: 'ignore',
		});

		if (result.exitCode !== 0 || !result.stdout) {
			return false;
		}

		const pids = new TextDecoder()
			.decode(result.stdout)
			.trim()
			.split('\n')
			.filter((line) => line && /^\d+$/.test(line));

		if (pids.length === 0) {
			return false;
		}

		// Kill each process
		for (const pid of pids) {
			try {
				// Use SIGKILL to ensure cleanup
				const killResult = Bun.spawnSync(['kill', '-9', pid], {
					stdout: 'ignore',
					stderr: 'ignore',
				});
				if (killResult.exitCode === 0) {
					logger.debug('Killed orphan process %s on port %d', pid, port);
				}
			} catch {
				// Ignore kill errors
			}
		}

		// Brief pause to let the port be released
		await new Promise((resolve) => setTimeout(resolve, 100));
		return true;
	} catch {
		return false;
	}
}

/**
 * Ensure the port is available, cleaning up any orphan processes if needed.
 */
async function ensurePortAvailable(
	port: number,
	logger: { debug: (msg: string, ...args: unknown[]) => void }
): Promise<void> {
	const available = await isPortAvailable(port);
	if (available) {
		return;
	}

	logger.debug('Port %d is in use, attempting to clean up orphan process...', port);

	const killed = await killProcessOnPort(port, logger);
	if (killed) {
		// Verify the port is now free
		const nowAvailable = await isPortAvailable(port);
		if (!nowAvailable) {
			throw new Error(
				`Port ${port} is still in use after cleanup. Another process may be holding it.\n` +
					`Run 'lsof -i :${port}' to identify the process.`
			);
		}
		logger.debug('Port %d is now available', port);
	} else {
		throw new Error(
			`Port ${port} is already in use.\n` +
				`Run 'lsof -i :${port}' to identify the process, or kill it manually.`
		);
	}
}

/**
 * Validation result for app.ts entry point.
 */
interface AppValidationResult {
	/** Whether app.ts has a default export */
	hasDefaultExport: boolean;
	/** Whether app.ts calls createApp() */
	hasCreateApp: boolean;
	/** Whether it's the v1 pattern (destructuring without export) */
	isV1Pattern: boolean;
	/** Any validation hints to show */
	hints: string[];
}

/**
 * Validate app.ts for common issues that prevent Bun --hot from starting.
 *
 * Bun --hot requires `export default { fetch, port }` to start a server.
 * Common mistakes:
 * - No `export default` (v1 pattern: destructuring result without exporting)
 * - Calling createApp() but not exporting it
 *
 * @internal Exported for testing only
 */
export async function validateAppTs(appPath: string): Promise<AppValidationResult> {
	const result: AppValidationResult = {
		hasDefaultExport: false,
		hasCreateApp: false,
		isV1Pattern: false,
		hints: [],
	};

	const file = Bun.file(appPath);
	if (!(await file.exists())) {
		return result;
	}

	const content = await file.text();

	// Strip comments to avoid false positives from commented-out code
	// Simple approach: remove single-line and multi-line comments
	const codeWithoutComments = content
		.replace(/\/\/.*$/gm, '') // Single-line comments
		.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments

	// Check for default export patterns (only in actual code, not comments)
	// Matches: export default createApp(...), export default await createApp(...),
	// export default { fetch, port }, const { ... } = await createApp(...) then export default result
	result.hasDefaultExport = /\bexport\s+default\b/.test(codeWithoutComments);

	// Check for createApp call
	result.hasCreateApp = /\bcreateApp\s*\(/.test(content);

	// Detect v1 pattern: destructuring createApp result without export default
	// e.g., const { server, logger } = await createApp({...});
	const hasDestructuring = /const\s*\{[^}]*\}\s*=\s*(?:await\s+)?createApp/.test(content);
	if (hasDestructuring && !result.hasDefaultExport) {
		result.isV1Pattern = true;
		result.hints.push(
			'app.ts calls createApp() but does not export it. Bun --hot requires `export default` to start a server.',
			'',
			'Fix: Change your app.ts to export the createApp() result:',
			'',
			'  import { createApp } from "@agentuity/runtime";',
			'  import agents from "@agent/index";',
			'',
			'  export default createApp({',
			'    agents,',
			'    router: { path: "/api", router: api },',
			'  });',
			'',
			'Or if you need the logger:',
			'',
			'  const app = await createApp({ agents });',
			'  app.logger.debug("Running %s", app.server.url);',
			'  export default app;'
		);
	}

	// Check for missing createApp entirely
	if (!result.hasCreateApp && !content.includes('Bun.serve')) {
		result.hints.push(
			'app.ts does not call createApp(). This is required for Agentuity apps.',
			'',
			'Example:',
			'',
			'  import { createApp } from "@agentuity/runtime";',
			'  export default createApp({ agents });'
		);
	}

	return result;
}

/**
 * Build a detailed error message with validation hints and captured output.
 *
 * @internal Exported for testing only
 */
export function buildStartupErrorMessage(
	port: number,
	timeoutMs: number,
	stderr: string,
	validation: AppValidationResult
): string {
	const lines: string[] = [];

	lines.push(`Bun server failed to start on port ${port} after ${timeoutMs}ms`);
	lines.push('');

	// Show captured stderr if any
	if (stderr.trim()) {
		lines.push('Bun output:');
		lines.push('');
		// Indent stderr lines for readability
		for (const line of stderr.trim().split('\n').slice(0, 20)) {
			lines.push(`  ${line}`);
		}
		if (stderr.split('\n').length > 20) {
			lines.push('  ... (truncated)');
		}
		lines.push('');
	}

	// Show validation hints
	if (validation.hints.length > 0) {
		lines.push('Possible issue:');
		lines.push('');
		for (const hint of validation.hints) {
			lines.push(`  ${hint}`);
		}
		lines.push('');
	}

	// Generic troubleshooting if no specific hints
	if (validation.hints.length === 0) {
		lines.push('Troubleshooting:');
		lines.push('');
		lines.push('  1. Check app.ts exports `export default createApp({...})`');
		lines.push('  2. Check for TypeScript/syntax errors in your code');
		lines.push(`  3. Check if port ${port} is already in use: lsof -i :${port}`);
		lines.push('  4. Try running manually: bun run --hot app.ts');
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Start Bun dev server with --hot (Vite asset server must already be running).
 *
 * Uses `bun --hot` so Bun watches all imported files and hot-swaps the fetch
 * handler on the running server. The server stays up — only the changed modules
 * are re-evaluated.
 */
export async function startBunDevServer(options: BunDevServerOptions): Promise<BunDevServerResult> {
	const { rootDir, port = 3500, logger, vitePort, inspect, inspectWait, inspectBrk } = options;

	logger.debug('Starting Bun dev server (Vite already running on port %d)...', vitePort);

	const appPath = `${rootDir}/app.ts`;

	const appFile = Bun.file(appPath);
	if (!(await appFile.exists())) {
		throw new Error(`App entry not found at ${appPath}.`);
	}

	// Pre-validate app.ts for common issues
	const validation = await validateAppTs(appPath);
	if (validation.isV1Pattern) {
		logger.warn('');
		logger.warn('⚠️  app.ts may have a v1-style pattern that prevents Bun --hot from starting.');
		for (const hint of validation.hints) {
			logger.warn('   %s', hint);
		}
		logger.warn('');
	}

	// Ensure the port is available, cleaning up any orphan processes
	await ensurePortAvailable(port, logger);

	process.env.PORT = String(port);

	const args: string[] = ['bun'];

	// --hot: in-process hot reload — re-evaluates changed modules and swaps
	// the default export's fetch handler without restarting the process.
	// --no-clear-screen: don't clear terminal on reload (CLI manages output)
	args.push('--hot', '--no-clear-screen');

	if (inspectBrk) {
		args.push('--inspect-brk');
	} else if (inspectWait) {
		args.push('--inspect-wait');
	} else if (inspect) {
		args.push('--inspect');
	}

	args.push('run', appPath);

	logger.debug('Spawning bun subprocess: %s', args.join(' '));

	// Capture stderr for error reporting while still showing it in real-time
	const stderrChunks: string[] = [];
	const stdoutChunks: string[] = [];

	// Helper to read a stream, capture output, and forward to parent
	const captureStream = async (
		stream: ReadableStream<Uint8Array>,
		chunks: string[],
		output: typeof process.stdout | typeof process.stderr
	) => {
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const str = new TextDecoder().decode(value);
				chunks.push(str);
				output.write(value); // Forward to parent for real-time visibility
			}
		} catch {
			// Stream may be closed unexpectedly when process exits
		}
	};

	const bunProcess = Bun.spawn(args, {
		cwd: rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			...getAgentEnv(),
			PORT: String(port),
		},
	});

	// Start capturing streams in the background (don't await, we need to check server readiness)
	if (bunProcess.stdout) {
		captureStream(bunProcess.stdout, stdoutChunks, process.stdout).catch(() => {});
	}
	if (bunProcess.stderr) {
		captureStream(bunProcess.stderr, stderrChunks, process.stderr).catch(() => {});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ = bunProcess;

	// Wait for server to start listening
	const maxRetries = 50;
	const retryDelay = 100;
	const timeoutMs = maxRetries * retryDelay;
	let serverReady = false;

	for (let i = 0; i < maxRetries; i++) {
		if (bunProcess.exitCode !== null) {
			const stderr = stderrChunks.join('');
			throw new Error(
				`Bun subprocess exited with code ${bunProcess.exitCode} during startup\n\n${stderr}`
			);
		}

		try {
			await fetch(`http://127.0.0.1:${port}/`, {
				method: 'HEAD',
				signal: AbortSignal.timeout(1000),
			});
			serverReady = true;
			break;
		} catch {
			// Not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, retryDelay));
	}

	if (!serverReady) {
		try {
			bunProcess.kill();
		} catch (err) {
			logger.debug('Error killing subprocess during startup failure: %s', err);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ = undefined;

		const stderr = stderrChunks.join('');
		throw new Error(buildStartupErrorMessage(port, timeoutMs, stderr, validation));
	}

	logger.debug(`Bun dev server started on http://127.0.0.1:${port} (--hot mode)`);
	logger.debug(`Proxied to Vite:${vitePort}`);

	return { bunServerPort: port };
}
