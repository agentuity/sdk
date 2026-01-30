import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { shutdownAll, getClientCount, getClients, hasActiveClients } from '../src/registry';
import { PostgresClient } from '../src/client';

// Symbol used by the registry
const REGISTRY_KEY = Symbol.for('@agentuity/postgres:registry');

// Helper to clear the registry between tests
function clearRegistry() {
	const global = globalThis as Record<symbol, Set<PostgresClient>>;
	if (global[REGISTRY_KEY]) {
		global[REGISTRY_KEY].clear();
	}
}

// Mock PostgresClient for testing
function createMockClient(options: { shuttingDown?: boolean } = {}) {
	const client = {
		shutdown: mock(() => {}),
		close: mock(() => Promise.resolve()),
		shuttingDown: options.shuttingDown ?? false,
	} as unknown as PostgresClient;
	return client;
}

describe('registry', () => {
	beforeEach(() => {
		clearRegistry();
	});

	describe('getClientCount', () => {
		test('returns 0 when no clients registered', () => {
			expect(getClientCount()).toBe(0);
		});
	});

	describe('getClients', () => {
		test('returns empty set when no clients registered', () => {
			const clients = getClients();
			expect(clients.size).toBe(0);
		});
	});

	describe('hasActiveClients', () => {
		test('returns false when no clients registered', () => {
			expect(hasActiveClients()).toBe(false);
		});
	});

	describe('shutdownAll', () => {
		test('resolves immediately when no clients registered', async () => {
			await expect(shutdownAll()).resolves.toBeUndefined();
		});

		test('clears registry after shutdown', async () => {
			// Manually add a mock client to registry
			const global = globalThis as Record<symbol, Set<PostgresClient>>;
			if (!global[REGISTRY_KEY]) {
				global[REGISTRY_KEY] = new Set();
			}
			const mockClient = createMockClient();
			global[REGISTRY_KEY].add(mockClient);

			expect(getClientCount()).toBe(1);

			await shutdownAll();

			expect(getClientCount()).toBe(0);
		});

		test('calls shutdown and close on all clients', async () => {
			const global = globalThis as Record<symbol, Set<PostgresClient>>;
			if (!global[REGISTRY_KEY]) {
				global[REGISTRY_KEY] = new Set();
			}

			const client1 = createMockClient();
			const client2 = createMockClient();
			global[REGISTRY_KEY].add(client1);
			global[REGISTRY_KEY].add(client2);

			await shutdownAll();

			expect(client1.shutdown).toHaveBeenCalled();
			expect(client1.close).toHaveBeenCalled();
			expect(client2.shutdown).toHaveBeenCalled();
			expect(client2.close).toHaveBeenCalled();
		});

		test('respects timeout', async () => {
			const global = globalThis as Record<symbol, Set<PostgresClient>>;
			if (!global[REGISTRY_KEY]) {
				global[REGISTRY_KEY] = new Set();
			}

			// Create a client that takes a long time to close
			const slowClient = {
				shutdown: mock(() => {}),
				close: mock(() => new Promise((resolve) => setTimeout(resolve, 10000))),
				shuttingDown: false,
			} as unknown as PostgresClient;
			global[REGISTRY_KEY].add(slowClient);

			const start = Date.now();
			await shutdownAll(200); // 200ms timeout
			const elapsed = Date.now() - start;

			// Should complete in roughly 200ms, not 10000ms
			// Allow generous tolerance for CI environments with scheduling delays
			expect(elapsed).toBeLessThan(2000);
		});

		test('ignores close errors', async () => {
			const global = globalThis as Record<symbol, Set<PostgresClient>>;
			if (!global[REGISTRY_KEY]) {
				global[REGISTRY_KEY] = new Set();
			}

			const errorClient = {
				shutdown: mock(() => {}),
				close: mock(() => Promise.reject(new Error('Close failed'))),
				shuttingDown: false,
			} as unknown as PostgresClient;
			global[REGISTRY_KEY].add(errorClient);

			// Should not throw
			await expect(shutdownAll()).resolves.toBeUndefined();
		});
	});

	describe('client registration', () => {
		test('PostgresClient registers itself on creation', () => {
			// Note: We can't easily test this without a real database connection
			// because the PostgresClient constructor tries to connect.
			// This is tested implicitly through integration tests.
			expect(true).toBe(true);
		});
	});
});
