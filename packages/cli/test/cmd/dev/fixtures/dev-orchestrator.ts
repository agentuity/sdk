/**
 * Test fixture that simulates the dev mode startup/shutdown flow.
 *
 * Spawned as a subprocess by `dev-respawn.test.ts`. Boots:
 *   - A real front-door TCP proxy (the production ws-proxy.ts module).
 *   - A stand-in HTTP server on the "Bun" port.
 *   - A stand-in HTTP server on the "Vite" port.
 *
 * All three are registered with a real ProcessManager, mirroring what
 * dev/index.ts does in production. On SIGTERM we run procManager.cleanup()
 * and exit.
 *
 * Reads ports from env: ORCH_PROXY_PORT, ORCH_VITE_PORT, ORCH_BUN_PORT.
 * Writes "READY <proxyPort>" to stdout once everything is listening.
 */

import { createServer as createHttpServer } from 'node:http';
import { startWsProxy } from '../../../../src/cmd/build/vite/ws-proxy';
import { ProcessManager, initProcessManager } from '../../../../src/cmd/dev/process-manager';

const proxyPort = Number(process.env.ORCH_PROXY_PORT ?? 0);
const vitePort = Number(process.env.ORCH_VITE_PORT ?? 0);
const bunPort = Number(process.env.ORCH_BUN_PORT ?? 0);

if (!proxyPort || !vitePort || !bunPort) {
	console.error(
		'orchestrator: missing required env (ORCH_PROXY_PORT, ORCH_VITE_PORT, ORCH_BUN_PORT)'
	);
	process.exit(2);
}

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: (msg: string, ...args: unknown[]) => console.error('[orch]', msg, ...args),
	fatal: () => {},
	child: () => logger,
};

// Use the real ProcessManager so we exercise the production cleanup path.
const procManager: ProcessManager = initProcessManager(logger);

async function main() {
	// 1) Stand-in "Bun" backend.
	const bunServer = createHttpServer((_req, res) => {
		res.statusCode = 200;
		res.end('ok-bun');
	});
	await new Promise<void>((resolve, reject) => {
		bunServer.once('error', reject);
		bunServer.listen(bunPort, '127.0.0.1', () => resolve());
	});
	procManager.registerServer({
		id: 'bun-stub',
		server: bunServer,
		description: 'Bun backend stub',
		port: bunPort,
	});

	// 2) Stand-in "Vite" server.
	const viteServer = createHttpServer((_req, res) => {
		res.statusCode = 200;
		res.end('ok-vite');
	});
	await new Promise<void>((resolve, reject) => {
		viteServer.once('error', reject);
		viteServer.listen(vitePort, '127.0.0.1', () => resolve());
	});
	procManager.registerServer({
		id: 'vite-stub',
		server: viteServer,
		description: 'Vite stub',
		port: vitePort,
	});

	// 3) Real front-door proxy. Critical: register with closeAll() so
	// shutdown actually destroys piped sockets and releases the user port.
	const frontDoor = await startWsProxy({
		port: proxyPort,
		vitePort,
		backendPort: bunPort,
		routePaths: ['/api'],
		logger,
	});
	procManager.registerServer({
		id: 'front-door-proxy',
		server: { close: () => frontDoor.closeAll() },
		description: 'Front-door TCP proxy',
		port: proxyPort,
	});

	// Signal readiness.
	console.log(`READY ${proxyPort}`);

	let cleaning = false;
	const shutdown = async (reason: string) => {
		if (cleaning) return;
		cleaning = true;
		try {
			await procManager.cleanup(reason, 3000);
		} catch (err) {
			console.error('[orch] cleanup error:', err);
		}
		// Give the OS a final tick to release listening sockets.
		await new Promise((r) => setTimeout(r, 50));
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
	process.on('SIGHUP', () => void shutdown('SIGHUP'));
}

main().catch((err) => {
	console.error('[orch] startup failed:', err);
	process.exit(1);
});
