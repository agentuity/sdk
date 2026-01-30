/**
 * Global registry for PostgreSQL clients.
 *
 * This module provides a way to track all active PostgreSQL clients
 * so they can be gracefully shut down together (e.g., on process exit).
 *
 * The runtime can use `shutdownAll()` to close all registered clients
 * during graceful shutdown.
 *
 * When @agentuity/runtime is available, this module automatically registers
 * a shutdown hook so all postgres clients are closed during graceful shutdown.
 */

import type { PostgresClient } from './client';

/**
 * Symbol used to store the registry in globalThis to avoid conflicts.
 */
const REGISTRY_KEY = Symbol.for('@agentuity/postgres:registry');

/**
 * Symbol used to track if we've registered with the runtime.
 */
const RUNTIME_HOOK_REGISTERED = Symbol.for('@agentuity/postgres:runtime-hook-registered');

/**
 * Gets the global client registry, creating it if it doesn't exist.
 */
function getRegistry(): Set<PostgresClient> {
	const global = globalThis as Record<symbol, Set<PostgresClient>>;
	if (!global[REGISTRY_KEY]) {
		global[REGISTRY_KEY] = new Set();
	}
	return global[REGISTRY_KEY];
}

/**
 * Registers a client in the global registry.
 * Called automatically when a client is created.
 *
 * @param client - The client to register
 * @internal
 */
export function registerClient(client: PostgresClient): void {
	getRegistry().add(client);
}

/**
 * Unregisters a client from the global registry.
 * Called automatically when a client is closed.
 *
 * @param client - The client to unregister
 * @internal
 */
export function unregisterClient(client: PostgresClient): void {
	getRegistry().delete(client);
}

/**
 * Returns the number of registered clients.
 * Useful for debugging and testing.
 */
export function getClientCount(): number {
	return getRegistry().size;
}

/**
 * Returns all registered clients.
 * Useful for debugging and monitoring.
 */
export function getClients(): ReadonlySet<PostgresClient> {
	return getRegistry();
}

/**
 * Shuts down all registered PostgreSQL clients gracefully.
 *
 * This function:
 * 1. Signals shutdown to all clients (prevents reconnection)
 * 2. Closes all clients in parallel
 * 3. Clears the registry
 *
 * This is intended to be called by the runtime during graceful shutdown.
 *
 * @param timeoutMs - Optional timeout in milliseconds. If provided, the function
 *                    will resolve after the timeout even if some clients haven't
 *                    finished closing. Default: no timeout.
 * @returns A promise that resolves when all clients are closed (or timeout)
 *
 * @example
 * ```typescript
 * import { shutdownAll } from '@agentuity/postgres';
 *
 * process.on('SIGTERM', async () => {
 *   await shutdownAll(5000); // 5 second timeout
 *   process.exit(0);
 * });
 * ```
 */
export async function shutdownAll(timeoutMs?: number): Promise<void> {
	const registry = getRegistry();
	const clients = Array.from(registry);

	if (clients.length === 0) {
		return;
	}

	// Signal shutdown to all clients first (prevents reconnection attempts)
	for (const client of clients) {
		client.shutdown();
	}

	// Close all clients in parallel
	const closePromises = clients.map(async (client) => {
		try {
			await client.close();
		} catch {
			// Ignore close errors during shutdown
		}
	});

	// Wait for all to close, with optional timeout
	if (timeoutMs !== undefined) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, timeoutMs);
		});
		try {
			await Promise.race([Promise.all(closePromises), timeout]);
		} finally {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		}
	} else {
		await Promise.all(closePromises);
	}

	// Clear the registry
	registry.clear();
}

/**
 * Checks if there are any active (non-shutdown) clients.
 * Useful for health checks.
 */
export function hasActiveClients(): boolean {
	const registry = getRegistry();
	for (const client of registry) {
		if (!client.shuttingDown) {
			return true;
		}
	}
	return false;
}

/**
 * Attempts to register a shutdown hook with @agentuity/runtime if available.
 * This is called automatically when the first client is registered.
 *
 * @internal
 */
function tryRegisterRuntimeHook(): void {
	const global = globalThis as Record<symbol, boolean>;

	// Only try once
	if (global[RUNTIME_HOOK_REGISTERED]) {
		return;
	}
	global[RUNTIME_HOOK_REGISTERED] = true;

	// Try to dynamically import the runtime and register our shutdown hook
	// This is done asynchronously to avoid blocking client creation
	// and to handle the case where runtime is not available
	// Using Function constructor to avoid TypeScript trying to resolve the module at build time
	const dynamicImport = new Function('specifier', 'return import(specifier)') as (
		specifier: string
	) => Promise<{ registerShutdownHook?: (hook: () => Promise<void> | void) => void }>;

	dynamicImport('@agentuity/runtime')
		.then((runtime) => {
			if (typeof runtime.registerShutdownHook === 'function') {
				runtime.registerShutdownHook(async () => {
					await shutdownAll(5000); // 5 second timeout for graceful shutdown
				});
			}
		})
		.catch(() => {
			// Runtime not available - that's fine, user can call shutdownAll manually
		});
}

// Try to register with runtime when this module is first loaded
tryRegisterRuntimeHook();
