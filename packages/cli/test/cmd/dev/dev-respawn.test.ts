/**
 * End-to-end orphan-prevention test for the dev-mode startup/shutdown cycle.
 *
 * Verifies the central guarantee the user asked about: spawning dev mode,
 * killing it, and spawning another instance on the same ports must succeed
 * without conflicts. Concretely:
 *
 *   1. Spawn an orchestrator subprocess that boots all three pieces of the
 *      dev-mode plumbing (front-door proxy, Vite stub, Bun stub) registered
 *      with the real ProcessManager.
 *   2. Wait for "READY".
 *   3. SIGTERM the subprocess.
 *   4. Verify all three ports are free again (the orphan-prevention fix).
 *   5. Spawn a SECOND orchestrator on the SAME ports \u2014 must succeed.
 *   6. Verify it works, then clean up.
 *
 * If the front-door proxy's old `close()` (which doesn't destroy live
 * sockets) had been used, an open WebSocket would have kept the proxy
 * port bound past the SIGTERM grace window, and step 5 would fail with
 * EADDRINUSE.
 */

import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { createServer, connect } from 'node:net';

const orchestratorPath = join(import.meta.dir, 'fixtures/dev-orchestrator.ts');

async function findAvailablePort(start: number): Promise<number> {
	for (let port = start; port < start + 500; port++) {
		const free = await new Promise<boolean>((resolve) => {
			const s = createServer();
			s.once('error', () => resolve(false));
			s.listen(port, '127.0.0.1', () => {
				s.close(() => resolve(true));
			});
		});
		if (free) return port;
	}
	throw new Error('No available port');
}

async function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const s = createServer();
		s.once('error', () => resolve(false));
		s.listen(port, '127.0.0.1', () => {
			s.close(() => resolve(true));
		});
	});
}

interface OrchHandle {
	pid: number;
	proxyPort: number;
	vitePort: number;
	bunPort: number;
	stop: (signal?: NodeJS.Signals) => Promise<number | null>;
}

/**
 * Spawn the orchestrator and resolve once it prints "READY".
 *
 * Spawned with detached:true so it becomes a process-group leader. That
 * mirrors how dev/index.ts runs in production (Bun subprocess is a PG
 * leader so process.kill(-pid, ...) reaches the whole tree) and also
 * isolates SIGTERM to the orchestrator's group, not the test runner's.
 */
async function startOrchestrator(opts: {
	proxyPort: number;
	vitePort: number;
	bunPort: number;
}): Promise<OrchHandle> {
	const proc = Bun.spawn(['bun', 'run', orchestratorPath], {
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...process.env,
			ORCH_PROXY_PORT: String(opts.proxyPort),
			ORCH_VITE_PORT: String(opts.vitePort),
			ORCH_BUN_PORT: String(opts.bunPort),
		},
		detached: true,
	});

	const pid = proc.pid;
	if (!pid) throw new Error('orchestrator spawn returned no pid');

	// Stream stdout looking for READY. Time out after 10s.
	const ready = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('orchestrator never reported READY')), 10000);
		(async () => {
			try {
				if (!proc.stdout) {
					clearTimeout(timer);
					reject(new Error('orchestrator has no stdout'));
					return;
				}
				const decoder = new TextDecoder();
				let buf = '';
				for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
					buf += decoder.decode(chunk);
					if (buf.includes('READY')) {
						clearTimeout(timer);
						resolve();
						return;
					}
				}
				clearTimeout(timer);
				reject(new Error('orchestrator stdout closed before READY'));
			} catch (err) {
				clearTimeout(timer);
				reject(err);
			}
		})();
	});

	await ready;

	const stop = async (signal: NodeJS.Signals = 'SIGTERM'): Promise<number | null> => {
		// Kill the orchestrator's process group so any children are also caught.
		try {
			process.kill(-pid, signal);
		} catch {
			try {
				proc.kill(signal);
			} catch {
				// already dead
			}
		}
		// Wait for exit. Force-kill after 5s.
		const exitCode = await Promise.race([
			proc.exited,
			new Promise<number | null>((resolve) =>
				setTimeout(() => {
					try {
						process.kill(-pid, 'SIGKILL');
					} catch {
						// already dead
					}
					resolve(null);
				}, 5000)
			),
		]);
		return typeof exitCode === 'number' ? exitCode : null;
	};

	return {
		pid,
		proxyPort: opts.proxyPort,
		vitePort: opts.vitePort,
		bunPort: opts.bunPort,
		stop,
	};
}

async function expectPortServingHttp(port: number): Promise<string> {
	const res = await fetch(`http://127.0.0.1:${port}/`, {
		signal: AbortSignal.timeout(2000),
	});
	return await res.text();
}

describe('dev mode spawn / kill / respawn', () => {
	test('SIGTERM releases all three ports so a fresh instance can bind them', async () => {
		// Pick three ports we can reuse.
		const proxyPort = await findAvailablePort(18000);
		const vitePort = await findAvailablePort(proxyPort + 1);
		const bunPort = await findAvailablePort(vitePort + 1);

		// --- Round 1 ---
		const first = await startOrchestrator({ proxyPort, vitePort, bunPort });

		// All three ports are bound now.
		expect(await isPortFree(proxyPort)).toBe(false);
		expect(await isPortFree(vitePort)).toBe(false);
		expect(await isPortFree(bunPort)).toBe(false);

		// And the front-door proxy actually proxies through to Vite.
		const body1 = await expectPortServingHttp(proxyPort);
		expect(body1).toContain('ok-vite');

		// SIGTERM and wait for exit.
		const code = await first.stop('SIGTERM');
		expect(code).toBe(0);

		// All three ports must be free now. This is the central orphan-
		// prevention assertion: the front-door proxy must have released
		// its listener, even though the proxy holds piped sockets.
		// Allow a brief OS tick for TIME_WAIT / TCP teardown.
		await new Promise((r) => setTimeout(r, 200));
		expect(await isPortFree(proxyPort)).toBe(true);
		expect(await isPortFree(vitePort)).toBe(true);
		expect(await isPortFree(bunPort)).toBe(true);

		// --- Round 2: same ports, must succeed ---
		const second = await startOrchestrator({ proxyPort, vitePort, bunPort });

		expect(await isPortFree(proxyPort)).toBe(false);
		expect(await isPortFree(vitePort)).toBe(false);
		expect(await isPortFree(bunPort)).toBe(false);

		const body2 = await expectPortServingHttp(proxyPort);
		expect(body2).toContain('ok-vite');

		// Cleanup.
		await second.stop('SIGTERM');
		await new Promise((r) => setTimeout(r, 200));
		expect(await isPortFree(proxyPort)).toBe(true);
		expect(await isPortFree(vitePort)).toBe(true);
		expect(await isPortFree(bunPort)).toBe(true);
	}, 30000);

	test('SIGTERM with a long-lived WebSocket through the proxy still releases ports', async () => {
		// Reproduces the actual orphan condition. Open a WebSocket-style
		// piped connection through the front-door proxy and keep it alive,
		// then kill the orchestrator. Without the closeAll() fix the proxy
		// listener would refuse to close while the WS is open and the
		// proxy port would remain bound past SIGTERM \u2014 the second
		// startOrchestrator() call would fail with EADDRINUSE.
		const proxyPort = await findAvailablePort(18500);
		const vitePort = await findAvailablePort(proxyPort + 1);
		const bunPort = await findAvailablePort(vitePort + 1);

		const first = await startOrchestrator({ proxyPort, vitePort, bunPort });

		// Open a long-lived "WebSocket" upgrade through the proxy. The
		// orchestrator's Bun stub is a plain HTTP server that won't speak
		// WS, but the proxy still pipes the bytes through and that's all
		// we need to exercise the keep-the-port-bound code path.
		const wsKey = Buffer.from('test-key-1234567890ab').toString('base64');
		const upgradeReq = [
			'GET /api/stream HTTP/1.1',
			`Host: 127.0.0.1:${proxyPort}`,
			'Upgrade: websocket',
			'Connection: Upgrade',
			`Sec-WebSocket-Key: ${wsKey}`,
			'Sec-WebSocket-Version: 13',
			'\r\n',
		].join('\r\n');

		const wsClient = await new Promise<ReturnType<typeof connect>>((resolve, reject) => {
			const c = connect(proxyPort, '127.0.0.1');
			c.once('error', reject);
			c.once('connect', () => {
				c.write(upgradeReq);
				// Wait briefly so the proxy actually pipes through.
				setTimeout(() => resolve(c), 100);
			});
		});

		// Kill the orchestrator while the WS is still connected.
		const code = await first.stop('SIGTERM');
		expect(code).toBe(0);

		// The piped client should be torn down by closeAll().
		await new Promise((r) => setTimeout(r, 200));

		// Ports MUST be free even though we held a WS open.
		expect(await isPortFree(proxyPort)).toBe(true);
		expect(await isPortFree(vitePort)).toBe(true);
		expect(await isPortFree(bunPort)).toBe(true);

		// And we can bind a fresh instance on the same ports.
		const second = await startOrchestrator({ proxyPort, vitePort, bunPort });
		const body = await expectPortServingHttp(proxyPort);
		expect(body).toContain('ok-vite');

		await second.stop('SIGTERM');
		await new Promise((r) => setTimeout(r, 200));
		expect(await isPortFree(proxyPort)).toBe(true);

		// Make sure we don't leak the client socket.
		try {
			wsClient.destroy();
		} catch {
			// already dead
		}
	}, 45000);

	test('SIGKILL of orchestrator also leaves ports free (worst-case OS reaping)', async () => {
		// Belt-and-suspenders: even on SIGKILL (no graceful shutdown), the
		// kernel reaps the listening sockets. This is what happens when
		// dev mode crashes hard. We verify the next instance can still bind.
		const proxyPort = await findAvailablePort(19000);
		const vitePort = await findAvailablePort(proxyPort + 1);
		const bunPort = await findAvailablePort(vitePort + 1);

		const first = await startOrchestrator({ proxyPort, vitePort, bunPort });
		await first.stop('SIGKILL');

		// SIGKILL relies on the OS to release sockets \u2014 give it a moment.
		await new Promise((r) => setTimeout(r, 500));
		expect(await isPortFree(proxyPort)).toBe(true);
		expect(await isPortFree(vitePort)).toBe(true);
		expect(await isPortFree(bunPort)).toBe(true);

		// Respawn must succeed.
		const second = await startOrchestrator({ proxyPort, vitePort, bunPort });
		await second.stop('SIGTERM');
	}, 30000);
});
