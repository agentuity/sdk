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
	// Track all unsafe calls for transaction verification
	const unsafeCalls: string[] = [];

	let currentRaw: Record<string, unknown> = {
		unsafe: mock((query: string, _params?: unknown[]) => {
			unsafeCalls.push(query);
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

	return { client, getRaw: () => currentRaw, unsafeCalls };
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

	it('uses transaction-wrapped executeWithRetry for INSERT queries', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
	});

	it('uses transaction-wrapped retry for INSERT with leading whitespace', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('  INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', '  INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
	});

	it('uses transaction-wrapped retry for case-insensitive INSERT', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('insert into items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'insert into items (name) VALUES ($1)', 'COMMIT']);
	});

	it('INSERT queries support .values() chaining', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		const result = await proxy
			.unsafe('INSERT INTO items (name) VALUES ($1) RETURNING *', ['test'])
			.values();

		expect(result).toEqual([[1]]);
		// With lazy thenable, .values() is called before .then(), so only
		// one transaction executes (in values mode)
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'INSERT INTO items (name) VALUES ($1) RETURNING *',
			'COMMIT',
		]);
	});

	it('INSERT lazy thenable prevents double execution when values() is called', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Get the thenable (no execution yet)
		const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		// Call .values() — this should start execution
		const valuesResult = thenable.values();

		// Also await the base thenable — this should reuse the same execution
		const _baseResult = await thenable;

		// Wait for values too
		await valuesResult;

		// Only ONE execution should have run
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
	});

	it('INSERT lazy thenable executes on direct await (without .values())', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		const result = await proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(result).toEqual([{ id: 1 }]);
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
	});

	it('uses transaction-wrapped retry for INSERT with leading block comment', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('/* audit: user-123 */ INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'/* audit: user-123 */ INSERT INTO items (name) VALUES ($1)',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for INSERT with leading line comment', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('-- create new item\nINSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'-- create new item\nINSERT INTO items (name) VALUES ($1)',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for INSERT with newlines', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('\n\n  INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'\n\n  INSERT INTO items (name) VALUES ($1)',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for CTE INSERT', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe(
			'WITH new_item AS (SELECT $1::text AS name) INSERT INTO items (name) SELECT name FROM new_item RETURNING *',
			['test']
		);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'WITH new_item AS (SELECT $1::text AS name) INSERT INTO items (name) SELECT name FROM new_item RETURNING *',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for CTE INSERT with multiple CTEs', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe(
			'WITH a AS (SELECT 1), b AS (SELECT 2) INSERT INTO items (name) VALUES ($1)',
			['test']
		);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'WITH a AS (SELECT 1), b AS (SELECT 2) INSERT INTO items (name) VALUES ($1)',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for case-insensitive CTE INSERT', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('with cte as (select 1) insert into items (name) values ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'with cte as (select 1) insert into items (name) values ($1)',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for CTE INSERT with nested parens', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe(
			'WITH cte AS (SELECT id FROM (SELECT id FROM items WHERE id IN (1, 2))) INSERT INTO archive (id) SELECT id FROM cte',
			[]
		);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'WITH cte AS (SELECT id FROM (SELECT id FROM items WHERE id IN (1, 2))) INSERT INTO archive (id) SELECT id FROM cte',
			'COMMIT',
		]);
	});

	it('still uses executeWithRetry for CTE SELECT', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('WITH cte AS (SELECT 1) SELECT * FROM cte');

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
	});

	it('uses transaction-wrapped retry for CTE UPDATE', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('WITH cte AS (SELECT 1) UPDATE items SET name = $1', ['new']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'WITH cte AS (SELECT 1) UPDATE items SET name = $1',
			'COMMIT',
		]);
	});

	it('uses transaction-wrapped retry for CTE DELETE', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('WITH cte AS (SELECT 1) DELETE FROM items WHERE id = $1', [1]);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'BEGIN',
			'WITH cte AS (SELECT 1) DELETE FROM items WHERE id = $1',
			'COMMIT',
		]);
	});

	it('does not false-match INSERT keyword inside CTE subexpression', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// The word "INSERT" appears inside the CTE parens, but the top-level DML is SELECT
		await proxy.unsafe("WITH cte AS (SELECT 'INSERT' AS label) SELECT * FROM cte");

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
	});

	describe('CTE with parentheses inside strings/comments', () => {
		it('handles CTE with closing paren in single-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe("WITH cte AS (SELECT ')' AS x) INSERT INTO items VALUES ($1)", [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				"WITH cte AS (SELECT ')' AS x) INSERT INTO items VALUES ($1)",
				'COMMIT',
			]);
		});

		it('handles CTE with opening paren in single-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe("WITH cte AS (SELECT '(' AS x) INSERT INTO items VALUES ($1)", [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				"WITH cte AS (SELECT '(' AS x) INSERT INTO items VALUES ($1)",
				'COMMIT',
			]);
		});

		it('handles CTE with escaped single quotes and parens', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe("WITH cte AS (SELECT 'it''s ()' AS x) INSERT INTO items VALUES ($1)", [
				1,
			]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				"WITH cte AS (SELECT 'it''s ()' AS x) INSERT INTO items VALUES ($1)",
				'COMMIT',
			]);
		});

		it('handles CTE with parens in double-quoted identifier', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT "col(1)" FROM t) INSERT INTO items VALUES ($1)', [
				1,
			]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'WITH cte AS (SELECT "col(1)" FROM t) INSERT INTO items VALUES ($1)',
				'COMMIT',
			]);
		});

		it('handles CTE with parens in block comment', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT /* ) */ 1) INSERT INTO items VALUES ($1)', [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'WITH cte AS (SELECT /* ) */ 1) INSERT INTO items VALUES ($1)',
				'COMMIT',
			]);
		});

		it('handles CTE with parens in line comment', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT 1 -- )\nFROM t) INSERT INTO items VALUES ($1)', [
				1,
			]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'WITH cte AS (SELECT 1 -- )\nFROM t) INSERT INTO items VALUES ($1)',
				'COMMIT',
			]);
		});

		it('handles CTE with parens in dollar-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT $$)$$ AS x) INSERT INTO items VALUES ($1)', [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'WITH cte AS (SELECT $$)$$ AS x) INSERT INTO items VALUES ($1)',
				'COMMIT',
			]);
		});

		it('handles CTE with parens in tagged dollar-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT $fn$)($fn$ AS x) INSERT INTO items VALUES ($1)', [
				1,
			]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'WITH cte AS (SELECT $fn$)($fn$ AS x) INSERT INTO items VALUES ($1)',
				'COMMIT',
			]);
		});

		it('CTE with string parens and SELECT is still non-mutation', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe("WITH cte AS (SELECT '(' AS x) SELECT * FROM cte");
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			// Should NOT have transaction wrapping — this is a SELECT
			expect(unsafeCalls).toEqual(["WITH cte AS (SELECT '(' AS x) SELECT * FROM cte"]);
		});
	});

	it('still uses executeWithRetry for SELECT queries', async () => {
		const { client } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('SELECT * FROM items');

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
	});

	it('uses transaction-wrapped retry for UPDATE queries', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('UPDATE items SET name = $1', ['new']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'UPDATE items SET name = $1', 'COMMIT']);
	});

	it('uses transaction-wrapped retry for DELETE queries', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('DELETE FROM items WHERE id = $1', [1]);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['BEGIN', 'DELETE FROM items WHERE id = $1', 'COMMIT']);
	});

	it('rolls back INSERT transaction on query error', async () => {
		const unsafeCalls: string[] = [];
		let callIndex = 0;
		const mockUnsafe = mock((query: string, _params?: unknown[]) => {
			unsafeCalls.push(query);
			callIndex++;
			// First call: BEGIN succeeds
			// Second call: INSERT fails
			// Third call: ROLLBACK succeeds
			if (callIndex === 2) {
				return Promise.reject(new Error('query failed'));
			}
			const result = Promise.resolve([{ id: 1 }]);
			return Object.assign(result, {
				values: () => Promise.resolve([[1]]),
			});
		});

		const raw: Record<string, unknown> = {
			unsafe: mockUnsafe,
			begin: mock(() => Promise.resolve()),
			close: mock(() => Promise.resolve()),
			options: { parsers: {}, serializers: {} },
		};

		const client = {
			get raw() {
				return raw;
			},
			executeWithRetry: mock(async <T>(op: () => T | Promise<T>) => {
				return op();
			}),
		} as unknown as CallablePostgresClient;

		const proxy = createResilientSQLProxy(client);

		// Wrap in Promise.resolve() because the lazy thenable is a plain
		// object (not a Promise instance) and expect().rejects needs a real Promise
		await expect(
			Promise.resolve(proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']))
		).rejects.toThrow('query failed');

		expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'ROLLBACK']);
	});

	it('INSERT transaction re-resolves raw on retry after reconnection', async () => {
		const firstUnsafeCalls: string[] = [];
		const secondUnsafeCalls: string[] = [];

		const firstRaw: Record<string, unknown> = {
			unsafe: mock((query: string, _params?: unknown[]) => {
				firstUnsafeCalls.push(query);
				const result = Promise.resolve([{ id: 1 }]);
				return Object.assign(result, {
					values: () => Promise.resolve([[1]]),
				});
			}),
			begin: mock(() => Promise.resolve()),
			close: mock(() => Promise.resolve()),
			options: { parsers: {}, serializers: {} },
		};

		const secondRaw: Record<string, unknown> = {
			unsafe: mock((query: string, _params?: unknown[]) => {
				secondUnsafeCalls.push(query);
				const result = Promise.resolve([{ id: 2 }]);
				return Object.assign(result, {
					values: () => Promise.resolve([[2]]),
				});
			}),
			begin: mock(() => Promise.resolve()),
			close: mock(() => Promise.resolve()),
			options: { parsers: {}, serializers: {} },
		};

		let currentRaw = firstRaw;
		let retryCount = 0;
		const client = {
			get raw() {
				return currentRaw;
			},
			executeWithRetry: mock(async <T>(op: () => T | Promise<T>) => {
				retryCount++;
				if (retryCount === 1) {
					// Simulate reconnection: swap to second raw
					currentRaw = secondRaw;
				}
				return op();
			}),
		} as unknown as CallablePostgresClient;

		const proxy = createResilientSQLProxy(client);
		const result = await proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		// Should have used the second raw (post-reconnection) since
		// raw is re-resolved inside the retry callback
		expect(result).toEqual([{ id: 2 }]);
		expect(firstUnsafeCalls).toEqual([]); // First raw was never used
		expect(secondUnsafeCalls).toEqual([
			'BEGIN',
			'INSERT INTO items (name) VALUES ($1)',
			'COMMIT',
		]);
	});

	describe('data safety: single-execution guarantee', () => {
		it('mutation via await returns row objects (not arrays)', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			expect(result).toEqual([{ id: 1 }]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		});

		it('mutation via .values() returns arrays (not row objects)', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy
				.unsafe('INSERT INTO items (name) VALUES ($1)', ['test'])
				.values();
			expect(result).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		});

		it('concurrent await and .values() via Promise.all runs single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			// Both consume the thenable concurrently
			await Promise.all([thenable, thenable.values()]);
			// MUST be exactly one transaction — no duplicate INSERT
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
		});

		it('.values() then await reuses same execution (no duplicate mutation)', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			const valuesPromise = thenable.values();
			// Await thenable AFTER .values() already started execution
			await thenable;
			await valuesPromise;
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
		});

		it('await then .values() reuses same execution (no duplicate mutation)', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('DELETE FROM items WHERE id = $1', [1]);
			// Await first (starts execution in row-object mode)
			await thenable;
			// Then call .values() — must reuse, not re-execute
			await thenable.values();
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'DELETE FROM items WHERE id = $1', 'COMMIT']);
		});

		it('multiple awaits of same thenable run single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('UPDATE items SET name = $1', ['new']);
			await thenable;
			await thenable;
			await thenable;
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'UPDATE items SET name = $1', 'COMMIT']);
		});

		it('multiple .values() calls run single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			const v1 = thenable.values();
			const v2 = thenable.values();
			const v3 = thenable.values();
			// All should resolve to the same promise
			const [r1, r2, r3] = await Promise.all([v1, v2, v3]);
			expect(r1).toEqual([[1]]);
			expect(r2).toEqual([[1]]);
			expect(r3).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
		});

		it('.catch() triggers execution exactly once', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			// .catch() should start execution (via startExecution(false))
			await thenable.catch(() => {});
			// Verify single execution
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'INSERT INTO items (name) VALUES ($1)', 'COMMIT']);
		});

		it('.finally() triggers execution exactly once', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('UPDATE items SET active = false');
			// .finally() should start execution (via startExecution(false))
			await thenable.finally(() => {});
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'UPDATE items SET active = false', 'COMMIT']);
		});

		it('UPDATE queries support .values() chaining with single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy
				.unsafe('UPDATE items SET name = $1 RETURNING *', ['new'])
				.values();
			expect(result).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['BEGIN', 'UPDATE items SET name = $1 RETURNING *', 'COMMIT']);
		});

		it('DELETE queries support .values() chaining with single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy
				.unsafe('DELETE FROM items WHERE id = $1 RETURNING *', [1])
				.values();
			expect(result).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'BEGIN',
				'DELETE FROM items WHERE id = $1 RETURNING *',
				'COMMIT',
			]);
		});
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
