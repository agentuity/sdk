import { describe, test, expect, beforeEach } from 'bun:test';
import { createMockPostgresPool } from '@agentuity/test-utils';
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
			expect(key).toBe('postgres://example/db\x005\x00240\x005000');
		});

		test('normalizes string config', () => {
			expect(computePoolHotReloadKey('postgres://example/db')).toBe(
				'postgres://example/db\x0010\x00\x00'
			);
		});
	});

	describe('registerClient hot reload supersession', () => {
		test('closes superseded pool with the same hot-reload key', () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const first = createMockPostgresPool();
			const second = createMockPostgresPool();

			registerClient(first, { hotReloadKey: key });
			registerClient(second, { hotReloadKey: key });

			expect(first.close).toHaveBeenCalledTimes(1);
			expect(getClientCount()).toBe(2);
			expect(getSharedHotReloadPool(key)).toBe(second);
		});

		test('does not close pools when hot reload is disabled', () => {
			__setHotReloadEnabledForTests(false);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const first = createMockPostgresPool();
			const second = createMockPostgresPool();

			registerClient(first, { hotReloadKey: key });
			registerClient(second, { hotReloadKey: key });

			expect(first.close).not.toHaveBeenCalled();
		});

		test('unregister removes cached shared pool reference', () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const pool = createMockPostgresPool();

			registerClient(pool, { hotReloadKey: key });
			expect(getSharedHotReloadPool(key)).toBe(pool);

			unregisterClient(pool);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});

	describe('getSharedHotReloadPool', () => {
		test('returns cached pool while open', () => {
			const key = 'test-key';
			const pool = createMockPostgresPool();
			supersedeHotReloadConnection(pool, key);
			expect(getSharedHotReloadPool(key)).toBe(pool);
		});

		test('ignores ended pools', () => {
			const key = 'test-key';
			const pool = createMockPostgresPool({ ended: true });
			supersedeHotReloadConnection(pool, key);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});

	describe('shutdownAll', () => {
		test('still clears registry after hot reload registrations', async () => {
			__setHotReloadEnabledForTests(true);
			const key = computePoolHotReloadKey({ connectionString: 'postgres://example/db', max: 3 });
			const pool = createMockPostgresPool();
			registerClient(pool, { hotReloadKey: key });

			await shutdownAll();
			expect(getClientCount()).toBe(0);
			expect(getSharedHotReloadPool(key)).toBeUndefined();
		});
	});
});
