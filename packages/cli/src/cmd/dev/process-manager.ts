/**
 * Process Manager for Dev Mode
 *
 * Tracks all spawned processes and ensures they're cleaned up on:
 * - Startup failure (any server fails to start)
 * - Runtime crash (uncaught exception)
 * - Graceful shutdown (SIGINT/SIGTERM)
 *
 * This prevents orphan processes and port conflicts between dev sessions.
 *
 * Key design decisions:
 * - Process tree killing: Uses process.kill(-pid) to kill entire process groups,
 *   preventing orphaned child processes (e.g., Bun backend spawning workers).
 * - Per-process SIGTERM→SIGKILL escalation: Each process gets its own grace
 *   period instead of waiting for all processes to exit before force-killing.
 * - Last-resort synchronous cleanup: forceKillAllSync() can be called from
 *   process.on('exit') handlers where async operations are not possible.
 */

import type { Logger } from '../../types';

export interface ManagedProcess {
	/** Process identifier for logging */
	id: string;
	/** The process handle */
	process: {
		kill: (signal?: number | NodeJS.Signals) => void;
		exitCode: number | null;
		pid?: number;
	};
	/** Human-readable description */
	description: string;
	/** The port this process uses (if any) */
	port?: number;
	/** Whether this process is critical (startup fails if it dies) */
	critical?: boolean;
}

export interface ManagedServer {
	/** Server identifier */
	id: string;
	/** The server handle */
	server: {
		close: () => void | Promise<void>;
	};
	/** Human-readable description */
	description: string;
	/** The port this server uses */
	port?: number;
}

/**
 * Process Manager
 *
 * Tracks all processes and servers started during dev mode and provides
 * centralized cleanup on failure or shutdown.
 */
export class ProcessManager {
	private processes: ManagedProcess[] = [];
	private servers: ManagedServer[] = [];
	private logger: Logger;
	private cleaningUp = false;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Register a spawned process for tracking.
	 */
	registerProcess(proc: ManagedProcess): void {
		this.processes.push(proc);
		this.logger.debug(
			'Registered process: %s (pid=%s, port=%s)',
			proc.id,
			proc.process.pid ?? 'unknown',
			proc.port ?? 'n/a'
		);
	}

	/**
	 * Register a server for tracking.
	 */
	registerServer(server: ManagedServer): void {
		this.servers.push(server);
		this.logger.debug('Registered server: %s (port=%s)', server.id, server.port ?? 'n/a');
	}

	/**
	 * Unregister a process (e.g., after it exits normally).
	 */
	unregisterProcess(id: string): void {
		const idx = this.processes.findIndex((p) => p.id === id);
		if (idx !== -1) {
			this.processes.splice(idx, 1);
			this.logger.debug('Unregistered process: %s', id);
		}
	}

	/**
	 * Unregister a server.
	 */
	unregisterServer(id: string): void {
		const idx = this.servers.findIndex((s) => s.id === id);
		if (idx !== -1) {
			this.servers.splice(idx, 1);
			this.logger.debug('Unregistered server: %s', id);
		}
	}

	/**
	 * Get all registered ports (for cleanup verification).
	 */
	getPorts(): number[] {
		const ports: number[] = [];
		for (const proc of this.processes) {
			if (proc.port) ports.push(proc.port);
		}
		for (const server of this.servers) {
			if (server.port) ports.push(server.port);
		}
		return ports;
	}

	/**
	 * Whether cleanup has already completed.
	 * Used by forceKillAllSync() to avoid redundant work.
	 */
	get isCleanedUp(): boolean {
		return this.cleaningUp && this.processes.length === 0 && this.servers.length === 0;
	}

	/**
	 * Kill a process and its entire process tree.
	 *
	 * Uses process.kill(-pid) to send the signal to the entire process group.
	 * This ensures child processes (e.g., workers spawned by Bun) are also killed.
	 * Falls back to direct PID kill if process group kill fails (e.g., EPERM or
	 * the process is not a group leader).
	 */
	private killProcessTree(pid: number, signal: NodeJS.Signals): boolean {
		// Safety: never send signals to PID 0 (own process group), PID 1 (init/systemd),
		// or negative PIDs (which would be double-negated). process.kill(-1) is
		// especially dangerous as it signals every process the user owns.
		if (pid <= 1) {
			this.logger.debug('Refusing to kill dangerous pid %d, skipping process tree kill', pid);
			return false;
		}

		// Try killing the entire process group first (negative PID)
		try {
			process.kill(-pid, signal);
			this.logger.debug('Sent %s to process group -%d', signal, pid);
			return true;
		} catch (err) {
			const error = err as NodeJS.ErrnoException;
			// ESRCH = no such process/group, EPERM = not a group leader or no permission
			if (error.code !== 'ESRCH') {
				this.logger.debug(
					'Process group kill failed for pid %d (%s), falling back to direct kill',
					pid,
					error.code
				);
			}
		}

		// Fall back to direct PID kill
		try {
			process.kill(pid, signal);
			this.logger.debug('Sent %s to pid %d (direct)', signal, pid);
			return true;
		} catch (err) {
			const error = err as NodeJS.ErrnoException;
			if (error.code !== 'ESRCH') {
				this.logger.debug('Direct kill failed for pid %d: %s', pid, error.code);
			}
			return false;
		}
	}

	/**
	 * Clean up all tracked processes and servers.
	 *
	 * Uses per-process SIGTERM→SIGKILL escalation: each process gets up to
	 * `timeout` ms to exit gracefully after SIGTERM. Processes that exit early
	 * don't delay cleanup of other processes.
	 *
	 * @param reason - Why cleanup is happening (for logging)
	 * @param timeout - Max time to wait for graceful shutdown per process (ms)
	 */
	async cleanup(reason: string, timeout = 3000): Promise<void> {
		if (this.cleaningUp) {
			this.logger.debug('Cleanup already in progress, skipping');
			return;
		}
		this.cleaningUp = true;

		this.logger.debug('Starting cleanup (reason: %s)', reason);

		// Snapshot processes and servers before cleanup so we can clear tracking
		// lists early. This prevents the exit handler from re-killing already
		// handled processes.
		const processSnapshot = [...this.processes];
		const serverSnapshot = [...this.servers];

		// Close servers first (reverse order, LIFO)
		for (let i = serverSnapshot.length - 1; i >= 0; i--) {
			const server = serverSnapshot[i];
			if (!server) continue;

			try {
				this.logger.debug('Closing server %s', server.id);
				const closePromise = server.server.close();
				if (closePromise instanceof Promise) {
					await Promise.race([
						closePromise,
						new Promise<void>((resolve) => setTimeout(resolve, 1000)),
					]);
				}
			} catch (err) {
				this.logger.debug('Error closing server %s: %s', server.id, err);
			}
		}

		// Send SIGTERM to all processes in reverse order (LIFO), targeting
		// process trees so child processes also receive the signal.
		for (let i = processSnapshot.length - 1; i >= 0; i--) {
			const proc = processSnapshot[i];
			if (!proc) continue;

			try {
				if (proc.process.exitCode === null) {
					const pid = proc.process.pid;
					this.logger.debug('Killing process %s (pid=%s)', proc.id, pid ?? 'unknown');
					if (pid) {
						this.killProcessTree(pid, 'SIGTERM');
					} else {
						proc.process.kill('SIGTERM');
					}
				}
			} catch (err) {
				this.logger.debug('Error killing process %s: %s', proc.id, err);
			}
		}

		// Wait for processes to exit, then force-kill individually.
		// Each process gets up to `timeout` ms from the initial SIGTERM.
		const startTime = Date.now();
		while (Date.now() - startTime < timeout) {
			const allExited = processSnapshot.every((p) => p.process.exitCode !== null);
			if (allExited) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Force kill any remaining processes and their process trees
		for (const proc of processSnapshot) {
			if (proc.process.exitCode === null) {
				const pid = proc.process.pid;
				try {
					this.logger.debug('Force killing process %s (pid=%s)', proc.id, pid ?? 'unknown');
					if (pid) {
						this.killProcessTree(pid, 'SIGKILL');
					} else {
						proc.process.kill('SIGKILL');
					}
				} catch (err) {
					this.logger.debug('Error force killing process %s: %s', proc.id, err);
				}
			}
		}

		this.logger.debug('Cleanup complete');
		this.processes = [];
		this.servers = [];
	}

	/**
	 * Synchronous last-resort cleanup for use in process.on('exit') handlers.
	 *
	 * Sends SIGKILL to all tracked process trees. This is intentionally
	 * aggressive because it's the final opportunity to prevent orphans.
	 * Only runs if async cleanup() hasn't already completed.
	 */
	forceKillAllSync(): void {
		if (this.isCleanedUp) return;

		for (const proc of this.processes) {
			if (proc.process.exitCode !== null) continue;
			const pid = proc.process.pid;
			try {
				if (pid && pid > 1) {
					// Try process group kill first, fall back to direct
					try {
						process.kill(-pid, 'SIGKILL');
					} catch {
						process.kill(pid, 'SIGKILL');
					}
				} else {
					proc.process.kill('SIGKILL');
				}
			} catch {
				// Best effort in exit handler — nothing else we can do
			}
		}

		this.processes = [];
		this.servers = [];
	}

	/**
	 * Verify that all ports used by tracked processes are released.
	 * Used after cleanup to ensure no orphan processes remain.
	 */
	async verifyPortsReleased(): Promise<{ port: number; released: boolean }[]> {
		const results: { port: number; released: boolean }[] = [];
		const ports = this.getPorts();

		for (const port of ports) {
			const released = await this.isPortAvailable(port);
			results.push({ port, released });

			if (!released) {
				this.logger.warn('Port %d is still in use after cleanup', port);
			}
		}

		return results;
	}

	/**
	 * Check if a port is available.
	 */
	private isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
		return new Promise((resolve) => {
			const net = require('node:net');
			const server = net.createServer();
			server.once('error', () => resolve(false));
			server.listen(port, host, () => {
				server.close(() => resolve(true));
			});
		});
	}
}

/**
 * Global process manager instance for dev mode.
 * Set in dev/index.ts during startup.
 */
let globalProcessManager: ProcessManager | null = null;

/**
 * Get the global process manager (throws if not initialized).
 */
export function getProcessManager(): ProcessManager {
	if (!globalProcessManager) {
		throw new Error('ProcessManager not initialized. Call initProcessManager first.');
	}
	return globalProcessManager;
}

/**
 * Initialize the global process manager.
 */
export function initProcessManager(logger: Logger): ProcessManager {
	globalProcessManager = new ProcessManager(logger);
	return globalProcessManager;
}

/**
 * Cleanup helper that can be called from signal handlers or error handlers.
 */
export async function cleanupAll(reason: string): Promise<void> {
	if (globalProcessManager) {
		await globalProcessManager.cleanup(reason);
	}
}
