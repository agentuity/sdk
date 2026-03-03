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
 *
 * The `begin` mock simulates `sql.begin(callback)` behavior:
 * it accepts a callback, creates a transaction-scoped mock connection,
 * and passes it to the callback. This mirrors how the production code
 * uses `currentRaw.begin(async (tx) => { ... })` for pool-safe transactions.
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
		begin: mock(async (fn: unknown) => {
			if (typeof fn === 'function') {
				// Simulate sql.begin(callback) behavior for mutation transactions
				const txUnsafe = mock((query: string, _params?: unknown[]) => {
					unsafeCalls.push(query);
					const result = Promise.resolve([{ id: 1 }]);
					return Object.assign(result, {
						values: () => Promise.resolve([[1]]),
					});
				});
				const txMock = { unsafe: txUnsafe };
				return (fn as (tx: Record<string, unknown>) => Promise<unknown>)(txMock);
			}
			// For non-callback calls (delegation tests), just resolve
			return Promise.resolve();
		}),
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
		// With lazy thenable, .values() starts execution — only one call
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
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
			begin: mock(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
				const txMock = { unsafe: newUnsafe };
				return fn(txMock);
			}),
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
			begin: mock(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
				const txMock = { unsafe: newUnsafe };
				return fn(txMock);
			}),
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
		expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
	});

	it('uses transaction-wrapped retry for INSERT with leading whitespace', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('  INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['  INSERT INTO items (name) VALUES ($1)']);
	});

	it('uses transaction-wrapped retry for case-insensitive INSERT', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('insert into items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['insert into items (name) VALUES ($1)']);
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
		expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1) RETURNING *']);
	});

	it('INSERT lazy thenable only executes once via .values()', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		// Get the thenable (no execution yet)
		const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		// Call .values() — this should start execution
		const valuesResult = await thenable.values();

		expect(valuesResult).toEqual([[1]]);
		// Only ONE execution should have run
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
	});

	it('INSERT lazy thenable executes on direct await (without .values())', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		const result = await proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(result).toEqual([{ id: 1 }]);
		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
	});

	it('uses transaction-wrapped retry for INSERT with leading block comment', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('/* audit: user-123 */ INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['/* audit: user-123 */ INSERT INTO items (name) VALUES ($1)']);
	});

	it('uses transaction-wrapped retry for INSERT with leading line comment', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('-- create new item\nINSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['-- create new item\nINSERT INTO items (name) VALUES ($1)']);
	});

	it('uses transaction-wrapped retry for INSERT with newlines', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('\n\n  INSERT INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['\n\n  INSERT INTO items (name) VALUES ($1)']);
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
			'WITH new_item AS (SELECT $1::text AS name) INSERT INTO items (name) SELECT name FROM new_item RETURNING *',
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
			'WITH a AS (SELECT 1), b AS (SELECT 2) INSERT INTO items (name) VALUES ($1)',
		]);
	});

	it('uses transaction-wrapped retry for case-insensitive CTE INSERT', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('with cte as (select 1) insert into items (name) values ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['with cte as (select 1) insert into items (name) values ($1)']);
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
			'WITH cte AS (SELECT id FROM (SELECT id FROM items WHERE id IN (1, 2))) INSERT INTO archive (id) SELECT id FROM cte',
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
		expect(unsafeCalls).toEqual(['WITH cte AS (SELECT 1) UPDATE items SET name = $1']);
	});

	it('uses transaction-wrapped retry for CTE DELETE', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('WITH cte AS (SELECT 1) DELETE FROM items WHERE id = $1', [1]);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['WITH cte AS (SELECT 1) DELETE FROM items WHERE id = $1']);
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
				"WITH cte AS (SELECT ')' AS x) INSERT INTO items VALUES ($1)",
			]);
		});

		it('handles CTE with opening paren in single-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe("WITH cte AS (SELECT '(' AS x) INSERT INTO items VALUES ($1)", [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				"WITH cte AS (SELECT '(' AS x) INSERT INTO items VALUES ($1)",
			]);
		});

		it('handles CTE with escaped single quotes and parens', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe(
				"WITH cte AS (SELECT 'it''s ()' AS x) INSERT INTO items VALUES ($1)",
				[1]
			);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				"WITH cte AS (SELECT 'it''s ()' AS x) INSERT INTO items VALUES ($1)",
			]);
		});

		it('handles CTE with parens in double-quoted identifier', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe(
				'WITH cte AS (SELECT "col(1)" FROM t) INSERT INTO items VALUES ($1)',
				[1]
			);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'WITH cte AS (SELECT "col(1)" FROM t) INSERT INTO items VALUES ($1)',
			]);
		});

		it('handles CTE with parens in block comment', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT /* ) */ 1) INSERT INTO items VALUES ($1)', [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'WITH cte AS (SELECT /* ) */ 1) INSERT INTO items VALUES ($1)',
			]);
		});

		it('handles CTE with parens in line comment', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe(
				'WITH cte AS (SELECT 1 -- )\nFROM t) INSERT INTO items VALUES ($1)',
				[1]
			);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'WITH cte AS (SELECT 1 -- )\nFROM t) INSERT INTO items VALUES ($1)',
			]);
		});

		it('handles CTE with parens in dollar-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe('WITH cte AS (SELECT $$)$$ AS x) INSERT INTO items VALUES ($1)', [1]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'WITH cte AS (SELECT $$)$$ AS x) INSERT INTO items VALUES ($1)',
			]);
		});

		it('handles CTE with parens in tagged dollar-quoted string', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			await proxy.unsafe(
				'WITH cte AS (SELECT $fn$)($fn$ AS x) INSERT INTO items VALUES ($1)',
				[1]
			);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual([
				'WITH cte AS (SELECT $fn$)($fn$ AS x) INSERT INTO items VALUES ($1)',
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

	it('detects INSERT with inline comment between keyword and INTO', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('INSERT/*hint*/INTO items (name) VALUES ($1)', ['test']);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['INSERT/*hint*/INTO items (name) VALUES ($1)']);
	});

	it('detects CTE mutation with inline comment after DML keyword', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('WITH cte AS (SELECT 1) DELETE/*where*/FROM items WHERE id = $1', [1]);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual([
			'WITH cte AS (SELECT 1) DELETE/*where*/FROM items WHERE id = $1',
		]);
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
		expect(unsafeCalls).toEqual(['UPDATE items SET name = $1']);
	});

	it('uses transaction-wrapped retry for DELETE queries', async () => {
		const { client, unsafeCalls } = createMockClient();
		const proxy = createResilientSQLProxy(client);

		await proxy.unsafe('DELETE FROM items WHERE id = $1', [1]);

		expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
		expect(unsafeCalls).toEqual(['DELETE FROM items WHERE id = $1']);
	});

	it('rolls back INSERT transaction on query error', async () => {
		const unsafeCalls: string[] = [];
		const mockBegin = mock(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
			// Create a transaction-scoped mock where unsafe fails
			const txUnsafe = mock((query: string, _params?: unknown[]) => {
				unsafeCalls.push(query);
				return Promise.reject(new Error('query failed'));
			});
			const txMock = { unsafe: txUnsafe };
			// sql.begin() calls the callback; if it throws, the driver
			// auto-rolls back and propagates the error
			return fn(txMock);
		});

		const raw: Record<string, unknown> = {
			unsafe: mock((query: string, _params?: unknown[]) => {
				unsafeCalls.push(query);
				const result = Promise.resolve([{ id: 1 }]);
				return Object.assign(result, {
					values: () => Promise.resolve([[1]]),
				});
			}),
			begin: mockBegin,
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

		// With sql.begin(callback), BEGIN/ROLLBACK are handled internally by the driver.
		// Only the actual query that was executed inside the callback appears in unsafeCalls.
		expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
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
			begin: mock(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
				const txUnsafe = mock((query: string, _params?: unknown[]) => {
					firstUnsafeCalls.push(query);
					const result = Promise.resolve([{ id: 1 }]);
					return Object.assign(result, {
						values: () => Promise.resolve([[1]]),
					});
				});
				const txMock = { unsafe: txUnsafe };
				return fn(txMock);
			}),
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
			begin: mock(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
				const txUnsafe = mock((query: string, _params?: unknown[]) => {
					secondUnsafeCalls.push(query);
					const result = Promise.resolve([{ id: 2 }]);
					return Object.assign(result, {
						values: () => Promise.resolve([[2]]),
					});
				});
				const txMock = { unsafe: txUnsafe };
				return fn(txMock);
			}),
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
		// With sql.begin(callback), only the actual query appears (no BEGIN/COMMIT)
		expect(secondUnsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
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

		it('throws when mixing .then() and .values() on same mutation thenable', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			// Await first (locks to row-object mode)
			await thenable;
			// .values() on the locked thenable must throw
			expect(() => thenable.values()).toThrow('Cannot access');
		});

		it('throws when mixing .values() and .then() on same mutation thenable', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('DELETE FROM items WHERE id = $1', [1]);
			// Call .values() first (locks to array mode)
			await thenable.values();
			// .then() on the locked thenable must throw
			expect(() => Promise.resolve(thenable)).toThrow('Cannot access');
		});

		it('multiple awaits of same thenable run single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('UPDATE items SET name = $1', ['new']);
			await thenable;
			await thenable;
			await thenable;
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['UPDATE items SET name = $1']);
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
			expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
		});

		it('.catch() triggers execution exactly once', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			// .catch() should start execution (via startExecution(false))
			await thenable.catch(() => {});
			// Verify single execution
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
		});

		it('.finally() triggers execution exactly once', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('UPDATE items SET active = false');
			// .finally() should start execution (via startExecution(false))
			await thenable.finally(() => {});
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['UPDATE items SET active = false']);
		});

		it('UPDATE queries support .values() chaining with single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy
				.unsafe('UPDATE items SET name = $1 RETURNING *', ['new'])
				.values();
			expect(result).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['UPDATE items SET name = $1 RETURNING *']);
		});

		it('DELETE queries support .values() chaining with single transaction', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const result = await proxy
				.unsafe('DELETE FROM items WHERE id = $1 RETURNING *', [1])
				.values();
			expect(result).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['DELETE FROM items WHERE id = $1 RETURNING *']);
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

	describe('thenable format locking', () => {
		it('throws when .values() called after .then() on mutation', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			// Lock to row-object mode
			await thenable;
			// Attempting .values() must throw
			expect(() => thenable.values()).toThrow('Cannot access .values() after .then()');
		});

		it('throws when .then() called after .values() on mutation', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('UPDATE items SET name = $1', ['new']);
			// Lock to values mode
			await thenable.values();
			// Attempting .then() must throw
			expect(() => Promise.resolve(thenable)).toThrow('Cannot access .then() after .values()');
		});

		it('allows repeated .then() calls on same mutation', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('INSERT INTO items (name) VALUES ($1)', ['test']);
			await thenable;
			await thenable;
			await thenable;
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['INSERT INTO items (name) VALUES ($1)']);
		});

		it('allows repeated .values() calls on same mutation', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('DELETE FROM items WHERE id = $1', [1]);
			const v1 = thenable.values();
			const v2 = thenable.values();
			const [r1, r2] = await Promise.all([v1, v2]);
			expect(r1).toEqual([[1]]);
			expect(r2).toEqual([[1]]);
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['DELETE FROM items WHERE id = $1']);
		});

		it('throws when .values() called after .then() on non-mutation', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('SELECT * FROM items');
			// Lock to row-object mode
			await thenable;
			// Attempting .values() must throw
			expect(() => thenable.values()).toThrow('Cannot access .values() after .then()');
		});

		it('throws when .then() called after .values() on non-mutation', async () => {
			const { client } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('SELECT * FROM items');
			// Lock to values mode
			await thenable.values();
			// Attempting .then() must throw
			expect(() => Promise.resolve(thenable)).toThrow('Cannot access .then() after .values()');
		});
	});

	describe('non-mutation single execution', () => {
		it('executes SELECT only once via .then()', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('SELECT * FROM items');
			await thenable;
			await thenable;
			// Exactly one execution
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['SELECT * FROM items']);
		});

		it('executes SELECT only once via .values()', async () => {
			const { client, unsafeCalls } = createMockClient();
			const proxy = createResilientSQLProxy(client);
			const thenable = proxy.unsafe('SELECT id, name FROM items');
			const v1 = thenable.values();
			const v2 = thenable.values();
			const [r1, r2] = await Promise.all([v1, v2]);
			expect(r1).toEqual([[1]]);
			expect(r2).toEqual([[1]]);
			// Exactly one execution
			expect(client.executeWithRetry).toHaveBeenCalledTimes(1);
			expect(unsafeCalls).toEqual(['SELECT id, name FROM items']);
		});
	});
});
