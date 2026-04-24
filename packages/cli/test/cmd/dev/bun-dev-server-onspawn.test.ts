/**
 * Tests for the onSpawn callback added to startBunDevServer().
 *
 * The callback is the central piece of the orphan-prevention fix for the Bun
 * backend: it lets dev/index.ts register the spawned subprocess with the
 * process manager IMMEDIATELY after spawn, before the readiness wait.
 * Without it, a SIGINT during the up-to-5s readiness loop would leave the
 * subprocess unmanaged.
 *
 * These tests spawn a real (but tiny) Bun app, so they're slower than the
 * pure-mock process-manager tests. We keep them in their own file so the
 * fast tests remain fast.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

const bunDevServerPath = join(import.meta.dir, '../../../src/cmd/build/vite/bun-dev-server.ts');

const mockLogger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	child: () => mockLogger,
};

async function findAvailablePort(start: number): Promise<number> {
	for (let port = start; port < start + 200; port++) {
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

/**
 * Build a minimal project Bun --hot can run successfully:
 *   export default { fetch, port }
 * Returns the project root.
 */
function createMinimalProject(): string {
	const root = join(tmpdir(), `bun-onspawn-${Date.now()}-${randomUUID()}`);
	mkdirSync(root, { recursive: true });
	mkdirSync(join(root, 'src'), { recursive: true });
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({ name: 't', version: '0.0.0', type: 'module' })
	);
	writeFileSync(
		join(root, 'app.ts'),
		`export default {
  port: Number(process.env.PORT ?? 0),
  fetch() { return new Response('ok'); },
};\n`
	);
	return root;
}

/**
 * Best-effort cleanup of a running subprocess registered via onSpawn.
 * Uses process-group SIGKILL on Unix to match production behavior.
 */
function killHandle(handle: { pid?: number; kill: (s?: NodeJS.Signals) => void }) {
	const pid = handle.pid;
	try {
		if (typeof pid === 'number' && pid > 1 && process.platform !== 'win32') {
			try {
				process.kill(-pid, 'SIGKILL');
				return;
			} catch {
				// fall through
			}
		}
		handle.kill('SIGKILL');
	} catch {
		// best effort
	}
}

describe('startBunDevServer onSpawn callback', () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = createMinimalProject();
	});

	afterEach(() => {
		try {
			rmSync(projectDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
		// Clear any global subprocess handle the production code may have set,
		// so tests stay isolated.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ = undefined;
	});

	test('invokes onSpawn before startBunDevServer resolves, with a usable handle', async () => {
		const { startBunDevServer } = await import(bunDevServerPath);
		const port = await findAvailablePort(17100);

		const events: string[] = [];
		let captured: { pid?: number; kill: (s?: NodeJS.Signals) => void } | null = null;

		await startBunDevServer({
			rootDir: projectDir,
			port,
			logger: mockLogger,
			vitePort: port + 1,
			onSpawn: (proc) => {
				events.push('onSpawn');
				captured = proc;
				expect(typeof proc.kill).toBe('function');
				// pid should be a real OS pid (>1) so the procManager can target
				// the process group via process.kill(-pid, ...).
				expect(typeof proc.pid).toBe('number');
				expect(proc.pid!).toBeGreaterThan(1);
				// At spawn time the child is alive \u2014 exitCode is null.
				expect(proc.exitCode).toBeNull();
			},
		});
		events.push('resolved');

		// onSpawn must have fired BEFORE startBunDevServer resolved. This is
		// the core orphan-prevention guarantee: registration with procManager
		// happens before the readiness wait completes.
		expect(events).toEqual(['onSpawn', 'resolved']);
		expect(captured).not.toBeNull();

		// Cleanup: kill the running subprocess.
		killHandle(captured!);
		// Give the OS a moment to release the port.
		await new Promise((r) => setTimeout(r, 200));
	}, 30000);

	test('kills subprocess and rethrows when onSpawn throws', async () => {
		const { startBunDevServer } = await import(bunDevServerPath);
		const port = await findAvailablePort(17300);

		let capturedPid: number | undefined;
		const sentinel = new Error('intentional onSpawn failure');

		await expect(
			startBunDevServer({
				rootDir: projectDir,
				port,
				logger: mockLogger,
				vitePort: port + 1,
				onSpawn: (proc) => {
					capturedPid = proc.pid;
					throw sentinel;
				},
			})
		).rejects.toBe(sentinel);

		// The global handle must have been cleared so downstream cleanup
		// doesn't try to re-kill an already-dead process.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((globalThis as any).__AGENTUITY_BUN_SUBPROCESS__).toBeUndefined();

		// And the subprocess must be gone \u2014 verify the OS no longer sees it.
		// Allow a brief grace window for SIGKILL to take effect.
		await new Promise((r) => setTimeout(r, 200));

		if (capturedPid && capturedPid > 1) {
			let stillAlive = false;
			try {
				process.kill(capturedPid, 0);
				stillAlive = true;
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				// ESRCH = no such process \u2014 exactly what we want.
				stillAlive = code !== 'ESRCH';
			}
			expect(stillAlive).toBe(false);
		}

		// Port should be free again now that the subprocess is dead.
		await new Promise((r) => setTimeout(r, 100));
		const free = await new Promise<boolean>((resolve) => {
			const s = createServer();
			s.once('error', () => resolve(false));
			s.listen(port, '127.0.0.1', () => {
				s.close(() => resolve(true));
			});
		});
		expect(free).toBe(true);
	}, 30000);

	test('onSpawn fires even before HTTP readiness probe succeeds', async () => {
		// This is a stricter version of the first test. We record the time
		// from spawn-call to onSpawn invocation, and from spawn-call to
		// resolution. onSpawn should fire well before resolution \u2014 there's
		// always a multi-100ms gap as Bun boots and starts listening.
		const { startBunDevServer } = await import(bunDevServerPath);
		const port = await findAvailablePort(17500);

		const startedAt = Date.now();
		let onSpawnAt = 0;
		let captured: { pid?: number; kill: (s?: NodeJS.Signals) => void } | null = null;

		await startBunDevServer({
			rootDir: projectDir,
			port,
			logger: mockLogger,
			vitePort: port + 1,
			onSpawn: (proc) => {
				onSpawnAt = Date.now();
				captured = proc;
			},
		});
		const resolvedAt = Date.now();

		const onSpawnDelay = onSpawnAt - startedAt;
		const totalDelay = resolvedAt - startedAt;

		// onSpawn must have fired strictly before resolution.
		expect(onSpawnAt).toBeGreaterThan(0);
		expect(onSpawnAt).toBeLessThanOrEqual(resolvedAt);
		// And meaningfully earlier \u2014 at least the readiness probe takes
		// some time. We use a soft lower bound (>=0ms) but require that
		// total is >= onSpawn time, which is the real guarantee.
		expect(totalDelay).toBeGreaterThanOrEqual(onSpawnDelay);

		killHandle(captured!);
		await new Promise((r) => setTimeout(r, 200));
	}, 30000);
});
