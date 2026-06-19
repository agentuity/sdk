import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
	__clearHotReloadCacheForTests,
	__setHotReloadEnabledForTests,
	computePoolHotReloadKey,
	getSharedHotReloadPool,
	supersedeHotReloadConnection,
} from '../src/hot-reload';
import { getClientCount, registerClient, shutdownAll, unregisterClient } from '../src/registry';

const REGISTRY_KEY = Symbol.for('@agentuity/postgres:registry');

function clearRegistry() {
	const global = globalThis as Record<symbol, Set<unknown>>;
	if (global[REGISTRY_KEY]) {
		global[REGISTRY_KEY].clear();
	}
}

function createMockPool(options: { ended?: boolean; shuttingDown?: boolean } = {}) {
	return {
		shutdown: mock(() => {}),
		close: mock(() => Promise.resolve()),
		ended: options.ended ?? false,
		shuttingDown: options.shuttingDown ?? false,
	};
}

describe('hot-reload', () => {
	beforeEach(() => {
		__setHotReloadEnabledForTests(undefined);
		__clearHotReloadCacheForTests();
		clearRegistry();
	});

	describe('computePoolHotReloadKey', () => {
		test('uses connection string and pool sizing', () => {
			const key = computePoolHotReloadKey({
				connectionString: 'postgres://example/db',
				max: 5,
				maxLifetimeSeconds: 240,
				connectionTimeoutMillis: 5000,
			});
			expect(key).toContain('postgres://example/db');
			expect(key).toContain('5');
			expect(key).toContain('240');
			expect(key).toContain('5000');
		});

		test('normalizes string config', () => {
			expect(computePoolHotReloadKey('postgres://example/db')).toContain(
				'postgres://example/db'
			);
		});
	});

	describe('registerClient hot reload supersession', () => {
		test('closes superseded pool with the same hot-reload key', () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const first = createMockPool();
			const second = createMockPool();

			registerClient(first, { hotReloadKey: key });
			registerClient(second, { hotReloadKey: key });

			expect(first.close).toHaveBeenCalledTimes(1);
			expect(getClientCount()).toBe(2);
			expect(getSharedHotReloadPool(key)).toBe(second);
		});

		test('does not close pools when hot reload is disabled', () => {
			__setHotReloadEnabledForTests(false);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const first = createMockPool();
			const second = createMockPool();

			registerClient(first, { hotReloadKey: key });
			registerClient(second, { hotReloadKey: key });

			expect(first.close).not.toHaveBeenCalled();
		});

		test('unregister removes cached shared pool reference', () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const pool = createMockPool();

			registerClient(pool, { hotReloadKey: key });
			expect(getSharedHotReloadPool(key)).toBe(pool);

			unregisterClient(pool);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});

	describe('getSharedHotReloadPool', () => {
		test('returns cached pool while open', () => {
			const key = 'test-key';
			const pool = createMockPool();
			supersedeHotReloadConnection(pool, key);
			expect(getSharedHotReloadPool(key)).toBe(pool);
		});

		test('ignores ended pools', () => {
			const key = 'test-key';
			const pool = createMockPool({ ended: true });
			supersedeHotReloadConnection(pool, key);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});

	describe('shutdownAll', () => {
		test('still clears registry after hot reload registrations', async () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const pool = createMockPool();
			registerClient(pool, { hotReloadKey: key });

			await shutdownAll();
			expect(getClientCount()).toBe(0);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});
});
