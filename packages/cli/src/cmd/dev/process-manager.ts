/**
 * Process Manager for Dev Mode
 *
 * Tracks all spawned processes and ensures they're cleaned up on:
 * - Startup failure (any server fails to start)
 * - Runtime crash (uncaught exception)
 * - Graceful shutdown (SIGINT/SIGTERM)
 *
 * This prevents orphan processes and port conflicts between dev sessions.
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
	 * Clean up all tracked processes and servers.
	 *
	 * @param reason - Why cleanup is happening (for logging)
	 * @param timeout - Max time to wait for graceful shutdown (ms)
	 */
	async cleanup(reason: string, timeout = 3000): Promise<void> {
		if (this.cleaningUp) {
			this.logger.debug('Cleanup already in progress, skipping');
			return;
		}
		this.cleaningUp = true;

		this.logger.debug('Starting cleanup (reason: %s)', reason);

		// Kill processes in reverse order (LIFO)
		for (let i = this.processes.length - 1; i >= 0; i--) {
			const proc = this.processes[i];
			if (!proc) continue;

			try {
				if (proc.process.exitCode === null) {
					this.logger.debug(
						'Killing process %s (pid=%s)',
						proc.id,
						proc.process.pid ?? 'unknown'
					);
					proc.process.kill('SIGTERM');
				}
			} catch (err) {
				this.logger.debug('Error killing process %s: %s', proc.id, err);
			}
		}

		// Close servers
		for (let i = this.servers.length - 1; i >= 0; i--) {
			const server = this.servers[i];
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

		// Wait for processes to exit, then force-kill if needed
		const startTime = Date.now();
		while (Date.now() - startTime < timeout) {
			const allExited = this.processes.every((p) => p.process.exitCode !== null);
			if (allExited) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Force kill any remaining
		for (const proc of this.processes) {
			if (proc.process.exitCode === null) {
				try {
					this.logger.debug('Force killing process %s', proc.id);
					proc.process.kill('SIGKILL');
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
