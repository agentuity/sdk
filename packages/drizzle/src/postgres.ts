import { SQL as BunSQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { postgres, type CallablePostgresClient, type PostgresConfig } from '@agentuity/postgres';
import type { PostgresDrizzleConfig, PostgresDrizzle } from './types';

/**
 * Resolves the PostgreSQL client configuration from Drizzle config options.
 *
 * URL priority chain: `connection.url` > `url` > `connectionString` > `process.env.DATABASE_URL`
 *
 * @internal Exported for testing — not part of the public package API.
 */
export function resolvePostgresClientConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(config?: PostgresDrizzleConfig<TSchema>): PostgresConfig {
	// Clone the connection config to avoid mutating the caller's object
	const clientConfig: PostgresConfig = config?.connection ? { ...config.connection } : {};

	// Resolve URL using priority chain
	if (!clientConfig.url) {
		if (config?.url) {
			clientConfig.url = config.url;
		} else if (config?.connectionString) {
			clientConfig.url = config.connectionString;
		} else if (process.env.DATABASE_URL) {
			clientConfig.url = process.env.DATABASE_URL;
		}
	}

	// Add reconnection configuration
	if (config?.reconnect) {
		clientConfig.reconnect = config.reconnect;
	}

	// Add callbacks
	if (config?.onReconnected) {
		clientConfig.onreconnected = config.onReconnected;
	}

	return clientConfig;
}

/**
 * Creates a dynamic SQL proxy that always delegates to the PostgresClient's
 * current raw connection. This ensures that after automatic reconnection,
 * Drizzle ORM uses the fresh connection instead of a stale reference.
 *
 * The proxy also wraps `unsafe()` calls with the client's retry logic,
 * providing automatic retry on transient connection errors.
 *
 * @internal Exported for testing — not part of the public package API.
 */
export function createResilientSQLProxy(
	client: CallablePostgresClient
): InstanceType<typeof BunSQL> {
	return new Proxy({} as InstanceType<typeof BunSQL>, {
		get(_target, prop, _receiver) {
			// Always resolve from the CURRENT raw connection (changes after reconnect)
			const raw = client.raw;

			if (prop === 'unsafe') {
				// Wrap unsafe() with retry logic for resilient queries.
				// Returns a thenable that also supports .values() chaining,
				// matching the SQLQuery interface that Drizzle expects:
				//   client.unsafe(query, params)           → Promise<rows>
				//   client.unsafe(query, params).values()   → Promise<rows>
				return (query: string, params?: unknown[]) => {
					const makeExecutor = (useValues: boolean) =>
						client.executeWithRetry(async () => {
							// Re-resolve raw inside retry to get post-reconnect instance
							const currentRaw = client.raw;
							const q = currentRaw.unsafe(query, params);
							return useValues ? q.values() : q;
						});

					// Return a thenable with .values() to match Bun's SQLQuery interface
					const result = makeExecutor(false);
					return Object.assign(result, {
						values: () => makeExecutor(true),
					});
				};
			}

			const value = (raw as unknown as Record<string | symbol, unknown>)[prop];
			if (typeof value === 'function') {
				// Bind to raw so `this` is correct inside begin(), savepoint(), etc.
				return (value as (...args: unknown[]) => unknown).bind(raw);
			}
			return value;
		},
	});
}

/**
 * Creates a Drizzle ORM instance with a resilient PostgreSQL connection.
 *
 * This function combines the power of Drizzle ORM with @agentuity/postgres's
 * automatic reconnection capabilities. The underlying connection will
 * automatically reconnect with exponential backoff if the connection is lost.
 *
 * @template TSchema - The Drizzle schema type for type-safe queries
 * @param config - Configuration options for the database connection
 * @returns An object containing the Drizzle instance, underlying client, and close function
 *
 * @example
 * ```typescript
 * import { createPostgresDrizzle } from '@agentuity/drizzle';
 * import * as schema from './schema';
 *
 * // Basic usage with DATABASE_URL
 * const { db, close } = createPostgresDrizzle({ schema });
 *
 * // Query with type safety
 * const users = await db.select().from(schema.users);
 *
 * // Clean up when done
 * await close();
 * ```
 *
 * @example
 * ```typescript
 * // With custom connection configuration
 * const { db, client, close } = createPostgresDrizzle({
 *   connectionString: 'postgres://user:pass@localhost:5432/mydb',
 *   schema,
 *   logger: true,
 *   reconnect: {
 *     maxAttempts: 5,
 *     initialDelayMs: 100,
 *   },
 *   onReconnected: () => console.log('Database reconnected'),
 * });
 *
 * // Access connection stats
 * console.log(client.stats);
 * ```
 */
export function createPostgresDrizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(config?: PostgresDrizzleConfig<TSchema>): PostgresDrizzle<TSchema> {
	// Resolve the postgres client configuration
	const clientConfig = resolvePostgresClientConfig(config);

	// Create the postgres client
	const client: CallablePostgresClient = postgres(clientConfig);

	// Wait for connection before calling onConnect callback
	// This ensures the callback executes only after the connection is established
	if (config?.onConnect) {
		client.waitForConnection().then(() => {
			config.onConnect!();
		});
	}

	// Create a resilient proxy that always delegates to the current raw SQL
	// connection. This ensures that after reconnection, Drizzle automatically
	// uses the new connection instead of the stale one.
	const resilientSQL = createResilientSQLProxy(client);

	// Create Drizzle instance using the resilient proxy instead of a static
	// reference to client.raw, which would become stale after reconnection.
	const db = drizzle({
		client: resilientSQL,
		schema: config?.schema,
		logger: config?.logger,
	});

	// Return the combined interface
	return {
		db,
		client,
		close: async () => {
			await client.close();
		},
	};
}
