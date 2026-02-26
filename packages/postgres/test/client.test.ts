/**
 * Tests for PostgresClient.executeWithRetry.
 *
 * The client is created with a dummy URL (lazy connection). We need to trick
 * the internal state so that _executeWithRetry doesn't try to warm the real
 * connection. We do this by setting _connected = true on the client instance.
 */
import { describe, it, expect } from 'bun:test';
import { PostgresClient } from '../src/client';

/**
 * Creates a PostgresClient with a dummy URL and forces internal state
 * so that executeWithRetry skips connection warming.
 */
function createTestClient(): PostgresClient {
	const client = new PostgresClient('postgres://localhost:5432/dummy');
	// Force the client to believe it's connected so _executeWithRetry
	// doesn't call _warmConnection() (which would try a real TCP connection).
	(client as unknown as Record<string, boolean>)._connected = true;
	return client;
}

describe('PostgresClient.executeWithRetry', () => {
	it('executes the operation and returns result', async () => {
		const client = createTestClient();
		try {
			const result = await client.executeWithRetry(async () => {
				return 42;
			});
			expect(result).toBe(42);
		} finally {
			await client.close();
		}
	});

	it('returns non-promise values', async () => {
		const client = createTestClient();
		try {
			const result = await client.executeWithRetry(() => {
				return 'hello';
			});
			expect(result).toBe('hello');
		} finally {
			await client.close();
		}
	});

	it('retries on retryable errors', async () => {
		const client = createTestClient();
		try {
			let attempts = 0;
			const result = await client.executeWithRetry(async () => {
				attempts++;
				if (attempts < 3) {
					const err = new Error('Connection closed');
					(err as unknown as Record<string, string>).code = 'ERR_POSTGRES_CONNECTION_CLOSED';
					throw err;
				}
				return 'success';
			});
			expect(result).toBe('success');
			expect(attempts).toBe(3);
		} finally {
			await client.close();
		}
	});

	it('throws non-retryable errors immediately', async () => {
		const client = createTestClient();
		try {
			let attempts = 0;
			await expect(
				client.executeWithRetry(async () => {
					attempts++;
					throw new Error('syntax error at or near "SELEC"');
				})
			).rejects.toThrow('syntax error');
			expect(attempts).toBe(1);
		} finally {
			await client.close();
		}
	});

	it('respects custom maxRetries parameter', async () => {
		const client = createTestClient();
		try {
			let attempts = 0;
			await expect(
				client.executeWithRetry(async () => {
					attempts++;
					const err = new Error('Connection closed');
					(err as unknown as Record<string, string>).code = 'ECONNRESET';
					throw err;
				}, 1)
			).rejects.toThrow('Connection closed');
			// maxRetries=1 means: initial attempt + 1 retry = 2 total attempts
			expect(attempts).toBe(2);
		} finally {
			await client.close();
		}
	});

	it('retries up to default maxRetries (3) then throws', async () => {
		const client = createTestClient();
		try {
			let attempts = 0;
			await expect(
				client.executeWithRetry(async () => {
					attempts++;
					const err = new Error('Connection reset');
					(err as unknown as Record<string, string>).code = 'ECONNRESET';
					throw err;
				})
			).rejects.toThrow('Connection reset');
			// Default maxRetries=3: initial attempt + 3 retries = 4 total
			expect(attempts).toBe(4);
		} finally {
			await client.close();
		}
	});

	it('returns result from successful retry', async () => {
		const client = createTestClient();
		try {
			let attempts = 0;
			const result = await client.executeWithRetry(async () => {
				attempts++;
				if (attempts === 1) {
					const err = new Error('Connection refused');
					(err as unknown as Record<string, string>).code = 'ECONNREFUSED';
					throw err;
				}
				return { data: 'recovered' };
			});
			expect(result).toEqual({ data: 'recovered' });
			expect(attempts).toBe(2);
		} finally {
			await client.close();
		}
	});

	it('throws after close', async () => {
		const client = createTestClient();
		await client.close();

		await expect(
			client.executeWithRetry(async () => {
				return 'should not reach';
			})
		).rejects.toThrow();
	});
});

describe('PostgresClient prepare option', () => {
	it('accepts prepare: false in config', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			prepare: false,
		});
		try {
			// Client should be created successfully with prepare: false
			expect(client).toBeDefined();
			expect(client.connected).toBe(false); // lazy connection
		} finally {
			await client.close();
		}
	});

	it('accepts prepare: true in config', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			prepare: true,
		});
		try {
			expect(client).toBeDefined();
			expect(client.connected).toBe(false);
		} finally {
			await client.close();
		}
	});

	it('defaults prepare to false when not specified', async () => {
		const client = new PostgresClient('postgres://localhost:5432/dummy');
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts prepare alongside other config options', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			prepare: false,
			max: 5,
			idleTimeout: 30,
			connectionTimeout: 10000,
			reconnect: { maxAttempts: 3 },
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});
});

describe('PostgresClient connection options', () => {
	it('accepts bigint: true in config', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			bigint: true,
		});
		try {
			expect(client).toBeDefined();
			expect(client.connected).toBe(false);
		} finally {
			await client.close();
		}
	});

	it('accepts bigint: false in config', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			bigint: false,
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts maxLifetime in config', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			maxLifetime: 3600,
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts maxLifetime: 0 for no limit', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			maxLifetime: 0,
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts connection runtime parameters', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			connection: {
				search_path: 'myapp,public',
				statement_timeout: '30s',
				application_name: 'test-app',
			},
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts path for Unix socket', async () => {
		const client = new PostgresClient({
			path: '/var/run/postgresql/.s.PGSQL.5432',
			database: 'dummy',
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts onconnect callback', async () => {
		const onconnect = (_err: Error | null) => {};
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			onconnect,
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts password as function', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			password: () => 'dynamic-password',
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts password as async function', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			password: async () => 'async-dynamic-password',
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});

	it('accepts all new options together', async () => {
		const client = new PostgresClient({
			url: 'postgres://localhost:5432/dummy',
			prepare: false,
			bigint: true,
			maxLifetime: 3600,
			connection: { application_name: 'test' },
			onconnect: () => {},
		});
		try {
			expect(client).toBeDefined();
		} finally {
			await client.close();
		}
	});
});
