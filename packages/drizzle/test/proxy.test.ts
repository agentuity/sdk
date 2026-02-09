/**
 * Tests for createResilientSQLProxy.
 *
 * Uses mocks to simulate a CallablePostgresClient without a real database.
 * Verifies that the proxy:
 * - Delegates to the current `client.raw` at access time
 * - Wraps `unsafe()` calls through `client.executeWithRetry`
 * - Supports `.values()` chaining on `unsafe()` results
 * - Binds other methods (begin, etc.) to the current raw
 * - Picks up a new raw instance after reconnection
 * - Re-resolves raw inside the retry callback
 */
import { describe, it, expect, mock } from 'bun:test';
import { createResilientSQLProxy } from '../src/postgres';
import type { CallablePostgresClient } from '@agentuity/postgres';

/**
 * Creates a minimal mock that satisfies the proxy's needs.
 * The mock exposes a `_setRaw` helper to simulate reconnection
 * (i.e., swapping the underlying raw SQL instance).
 */
function createMockClient() {
	let currentRaw: Record<string, unknown> = {
		unsafe: mock((_query: string, _params?: unknown[]) => {
			const result = Promise.resolve([{ id: 1 }]);
			return Object.assign(result, {
				values: () => Promise.resolve([[1]]),
			});
		}),
		begin: mock(() => Promise.resolve()),
		close: mock(() => Promise.resolve()),
		options: { parsers: {}, serializers: {} },
	};

	const client = {
		get raw() {
			return currentRaw;
		},
		executeWithRetry: mock(async <T>(op: () => T | Promise<T>) => {
			return op();
		}),
		_setRaw(newRaw: Record<string, unknown>) {
			currentRaw = newRaw;
		},
	} as unknown as CallablePostgresClient & { _setRaw: (raw: Record<string, unknown>) => void };

	return { client, getRaw: () => currentRaw };
}

describe('createResilientSQLProxy', () => {
	it('delegates unsafe() to the current raw', async () => {
		const { client, getRaw } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('SELECT 1');

		expect(getRaw().unsafe).toHaveBeenCalledWith('SELECT 1', undefined);
	});

	it('uses executeWithRetry for unsafe calls', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('SELECT 1');

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
	});

	it('proxy.unsafe().values() works', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		const result = await proxy.unsafe('SELECT 1').values();

		expect(result).toEqual([[1]]);
		// values() creates a separate makeExecutor(true) call, so executeWithRetry
		// is called once for the base promise and once for values()
		expect(client.executeWithRetry).toHaveBeenCalledTimes(2);
	});

	it('picks up new raw after reconnection', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Create a new raw to simulate reconnection
		const newUnsafe = mock((_query: string, _params?: unknown[]) => {
			const result = Promise.resolve([{ id: 2 }]);
			return Object.assign(result, {
				values: () => Promise.resolve([[2]]),
			});
		});
		const newRaw: Record<string, unknown> = {
			unsafe: newUnsafe,
			begin: mock(() => Promise.resolve()),
			options: { parsers: {}, serializers: {} },
		};

		// Swap the raw to simulate reconnection
		client._setRaw(newRaw);

		const result = await proxy.unsafe('SELECT 2');

		expect(result).toEqual([{ id: 2 }]);
		expect(newUnsafe).toHaveBeenCalledWith('SELECT 2', undefined);
	});

	it('delegates begin() to the current raw', async () => {
		const { client, getRaw } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await (proxy as unknown as Record<string, (...args: unknown[]) => unknown>).begin('test-arg');

		expect(getRaw().begin).toHaveBeenCalledWith('test-arg');
	});

	it('delegates property access to the current raw', () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Access a custom property set on the mock raw
		const options = (proxy as unknown as Record<string, unknown>).options;

		expect(options).toEqual({ parsers: {}, serializers: {} });
	});

	it('re-resolves raw inside retry callback', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Track which raw instances are used during retries
		// Create a new raw to simulate reconnection
		const newUnsafe = mock((_query: string, _params?: unknown[]) => {
			const result = Promise.resolve([{ id: 99 }]);
			return Object.assign(result, {
				values: () => Promise.resolve([[99]]),
			});
		});
		const newRaw: Record<string, unknown> = {
			unsafe: newUnsafe,
			begin: mock(() => Promise.resolve()),
			options: { parsers: {}, serializers: {} },
		};

		// Override executeWithRetry to simulate a retry after reconnection
		let callCount = 0;
		client.executeWithRetry = mock(async (op: () => unknown) => {
			callCount++;
			if (callCount === 1) {
				// Simulate reconnection before first execution
				client._setRaw(newRaw);
			}
			// op() re-resolves client.raw internally, so it gets the new raw
			return op();
		}) as typeof client.executeWithRetry;

		const result = await proxy.unsafe('SELECT 99');

		// Should have used the new raw (post-reconnection)
		expect(result).toEqual([{ id: 99 }]);
		expect(newUnsafe).toHaveBeenCalledWith('SELECT 99', undefined);
	});

	it('passes params to unsafe()', async () => {
		const { client, getRaw } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('SELECT $1', [42]);

		expect(getRaw().unsafe).toHaveBeenCalledWith('SELECT $1', [42]);
	});

	it('unsafe() returns a thenable with values()', () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		const result = proxy.unsafe('SELECT 1');

		// Should be thenable
		expect(typeof result.then).toBe('function');
		// Should have values() method
		expect(typeof result.values).toBe('function');
	});

	it('binds methods to the current raw (not stale)', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Get begin from proxy
		const _beginFn = proxy.begin;

		// Create a new raw with a different begin mock
		const newBegin = mock(() => Promise.resolve('new-tx'));
		const newRaw: Record<string, unknown> = {
			unsafe: mock(() => {
				const r = Promise.resolve([]);
				return Object.assign(r, { values: () => Promise.resolve([]) });
			}),
			begin: newBegin,
			options: {},
		};

		// Swap to the new raw
		client._setRaw(newRaw);

		// Call begin - but the proxy re-resolves raw each time .begin is accessed
		await (proxy as unknown as Record<string, (...args: unknown[]) => unknown>).begin('tx-arg');

		expect(newBegin).toHaveBeenCalledWith('tx-arg');
	});
});
