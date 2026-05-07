/**
 * Gravity tunnel orchestration for `agentuity dev --public`.
 *
 * Wraps the lifecycle of the gravity binary that the CLI spawns to
 * front the user's local dev server with a public HTTPS URL:
 *
 *   1. Spawns gravity with the project + endpoint args we got from
 *      the `/cli/devmode/3/<projectId>` API call.
 *   2. Tails stdout for the `HEARTBEAT_PORT=<n>` line gravity prints
 *      shortly after startup, then POSTs `/heartbeat` to that port
 *      every 5 seconds so gravity knows we're still alive. (The
 *      tunnel auto-tears-down if heartbeats stop.)
 *   3. Forwards stderr to the CLI logger so connection issues are
 *      visible.
 *   4. Exposes a `stop()` that kills the entire gravity process tree
 *      (gravity spawns helper children) and clears the heartbeat
 *      interval.
 *
 * Node-compatible: uses `node:child_process.spawn` with a detached
 * process group so we can deliver SIGTERM to the whole tree on
 * shutdown. No `Bun.spawn`.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import type { Logger } from '../../types.ts';

export interface GravityStartOptions {
	/** Path to the gravity binary on disk. */
	binary: string;
	/** Endpoint id returned by the CLI devmode API. */
	endpointId: string;
	/** Local port gravity should forward to (the user's dev server). */
	targetPort: number;
	/** Region-specific gravity gRPC URL. */
	gravityURL: string;
	/** Project owner org id. */
	orgId: string;
	/** Project id. */
	projectId: string;
	/**
	 * Base64-encoded private key PEM gravity uses to authenticate
	 * with the platform.
	 */
	privateKeyB64: string;
	/** Working directory for the spawn (defaults to process cwd). */
	cwd?: string;
	logger: Logger;
}

export interface GravityHandle {
	/** Underlying child process so callers can attach extra listeners. */
	readonly process: ChildProcess;
	/** Resolves when the gravity child exits. */
	readonly exited: Promise<{ exitCode: number | null }>;
	/**
	 * Stop the tunnel: clears the heartbeat interval and SIGTERMs the
	 * gravity process group. Safe to call multiple times.
	 */
	stop(): Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 2_000;

/**
 * Spawn gravity and wire up heartbeats + log forwarding. Returns
 * once the child has been spawned (heartbeats begin async when the
 * binary prints its `HEARTBEAT_PORT=` line).
 */
export function startGravity(opts: GravityStartOptions): GravityHandle {
	const { logger } = opts;

	// Strip PORT from the inherited env so gravity doesn't accidentally
	// pick up the dev-server port and start serving HTTP itself.
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.PORT;

	const args = [
		'--endpoint-id',
		opts.endpointId,
		'--port',
		String(opts.targetPort),
		'--url',
		opts.gravityURL,
		'--log-level',
		process.env.AGENTUITY_GRAVITY_LOG_LEVEL ?? 'error',
		'--org-id',
		opts.orgId,
		'--project-id',
		opts.projectId,
		'--private-key',
		opts.privateKeyB64,
		'--health-check',
	];

	const child = spawn(opts.binary, args, {
		cwd: opts.cwd,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		// Detach so the child becomes its own process-group leader and
		// kill(-pid) can reach helper grandchildren when we tear down.
		detached: true,
	});

	logger.debug('Gravity tunnel spawned (pid %d, target port %d)', child.pid, opts.targetPort);

	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let heartbeatPort: number | null = null;
	let stopped = false;

	const sendHeartbeat = async (port: number) => {
		try {
			await fetch(`http://127.0.0.1:${port}/heartbeat`, {
				method: 'POST',
				signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
			});
		} catch {
			// Heartbeat failures are recoverable — gravity will tear the
			// tunnel down on its own if they stop entirely.
		}
	};

	// Tail stdout for the HEARTBEAT_PORT line. Everything else goes to
	// debug-level logs; gravity emits routine connection chatter that
	// we don't want surfacing in the CLI's normal output.
	(async () => {
		const stdout = child.stdout;
		if (!stdout) return;
		stdout.setEncoding('utf-8');
		let buffer = '';
		try {
			for await (const chunk of stdout) {
				buffer += chunk;
				let newline: number;
				// biome-ignore lint/suspicious/noAssignInExpressions: classic line-buffer drain pattern
				while ((newline = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, newline).trim();
					buffer = buffer.slice(newline + 1);
					if (!line) continue;

					const match = line.match(/^HEARTBEAT_PORT=(\d+)$/);
					if (match?.[1]) {
						heartbeatPort = parseInt(match[1], 10);
						logger.debug('Gravity heartbeat port: %d', heartbeatPort);
						if (!heartbeatInterval && !stopped) {
							void sendHeartbeat(heartbeatPort);
							heartbeatInterval = setInterval(
								() => void sendHeartbeat(heartbeatPort!),
								HEARTBEAT_INTERVAL_MS
							);
						}
					} else {
						logger.debug('[gravity] %s', line);
					}
				}
			}
		} catch (err) {
			logger.debug('gravity stdout reader exited: %s', err);
		}
	})();

	(async () => {
		const stderr = child.stderr;
		if (!stderr) return;
		stderr.setEncoding('utf-8');
		try {
			for await (const chunk of stderr) {
				const text = String(chunk).trim();
				if (text) {
					logger.warn('[gravity] %s', text);
				}
			}
		} catch (err) {
			logger.debug('gravity stderr reader exited: %s', err);
		}
	})();

	const exited = new Promise<{ exitCode: number | null }>((resolve) => {
		child.once('close', (code) => {
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
				heartbeatInterval = null;
			}
			resolve({ exitCode: code });
		});
	});

	const stop = async (): Promise<void> => {
		if (stopped) return;
		stopped = true;

		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}

		const pid = child.pid;
		if (!pid || child.exitCode !== null) return;

		// detached:true makes pid a process-group leader, so we kill the
		// whole tree with `kill(-pid, signal)`. Falls back to direct
		// kill on EPERM (rare; helper children may already be gone).
		try {
			process.kill(-pid, 'SIGTERM');
			logger.debug('Sent SIGTERM to gravity process group -%d', pid);
		} catch {
			try {
				child.kill('SIGTERM');
				logger.debug('Sent SIGTERM to gravity pid %d (direct)', pid);
			} catch {
				// Already gone.
			}
		}

		// Give the child up to 2s to exit gracefully, then SIGKILL.
		await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);

		if (child.exitCode === null) {
			try {
				process.kill(-pid, 'SIGKILL');
			} catch {
				try {
					child.kill('SIGKILL');
				} catch {
					// Already gone.
				}
			}
		}
	};

	return { process: child, exited, stop };
}
