/**
 * Bun Dev Server
 *
 * Spawns Bun with --hot as a subprocess. Bun's --hot mode re-evaluates changed
 * modules and hot-swaps the default export's `fetch` handler on the running
 * server — no process restart, no port rebind, no dropped connections.
 *
 * The user's app.ts exports the result of createApp() which includes `fetch`
 * and `port` properties that Bun uses to manage the server lifecycle.
 */

import type { Logger } from '../../../types';
import { getAgentEnv } from '../../../agent-detection';

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

	const bunProcess = Bun.spawn(args, {
		cwd: rootDir,
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...process.env,
			...getAgentEnv(),
			PORT: String(port),
		},
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ = bunProcess;

	// Wait for server to start listening
	const maxRetries = 50;
	const retryDelay = 100;
	let serverReady = false;

	for (let i = 0; i < maxRetries; i++) {
		if (bunProcess.exitCode !== null) {
			throw new Error(`Bun subprocess exited with code ${bunProcess.exitCode} during startup`);
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
		throw new Error(
			`Bun server failed to start on port ${port} after ${maxRetries * retryDelay}ms`
		);
	}

	logger.debug(`Bun dev server started on http://127.0.0.1:${port} (--hot mode)`);
	logger.debug(`Proxied to Vite:${vitePort}`);

	return { bunServerPort: port };
}
