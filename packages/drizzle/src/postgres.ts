import { SQL as BunSQL, type SQL as BunSQLClient, type SQLOptions } from 'bun';
import { drizzle as upstreamDrizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql';
import type { DrizzleConfig } from 'drizzle-orm';
import { isConfig } from 'drizzle-orm/utils';
import {
	postgres,
	isMutationStatement,
	createThenable,
	type CallablePostgresClient,
	type PostgresConfig,
} from '@agentuity/postgres';
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

	// Forward prepare option
	if (config?.prepare !== undefined) {
		clientConfig.prepare = config.prepare;
	}

	// Forward bigint option
	if (config?.bigint !== undefined) {
		clientConfig.bigint = config.bigint;
	}

	// Forward maxLifetime option
	if (config?.maxLifetime !== undefined) {
		clientConfig.maxLifetime = config.maxLifetime;
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

			if (prop === 'close') {
				return () => client.close();
			}

			if (prop === 'unsafe') {
				// Wrap unsafe() with retry logic for resilient queries.
				// Returns a thenable that also supports .values() chaining,
				// matching the SQLQuery interface that Drizzle expects:
				//   client.unsafe(query, params)           → Promise<rows>
				//   client.unsafe(query, params).values()   → Promise<rows>
				return (query: string, params?: unknown[]) => {
					// Mutation statements (INSERT, UPDATE, DELETE) require special
					// handling for safe retry. They are wrapped in a transaction
					// (BEGIN/query/COMMIT) so that if the connection drops,
					// PostgreSQL auto-rolls back, preventing duplicate inserts,
					// double-applied updates, or repeated delete side effects.
					const isMutation = isMutationStatement(query);

				if (isMutation) {
					// Mutation statements are wrapped in a transaction and retried
					// via executeWithRetry. This is safe because PostgreSQL
					// guarantees that uncommitted transactions are automatically
					// rolled back when the connection drops. If the connection
					// fails before COMMIT completes, no changes are applied, and
					// the retry starts a fresh transaction on the new connection.
					//
					// We use sql.begin(callback) instead of manual BEGIN/COMMIT
					// because Bun's SQL driver requires it for pool-safe
					// transactions (ERR_POSTGRES_UNSAFE_TRANSACTION when max > 1).
					// sql.begin() reserves a specific connection, auto-COMMITs on
					// success, and auto-ROLLBACKs on error.
					//
					// NOTE: If the connection drops after the server processes
					// COMMIT but before the client receives the response, the
					// changes ARE committed. A retry would then apply them again.
					// This window is extremely small (< 1ms typically) and is an
					// inherent limitation of any retry-based approach without
					// application-level idempotency (e.g., unique constraints
					// with ON CONFLICT for INSERTs).
					// See: https://github.com/agentuity/sdk/issues/911
					const makeTransactionalExecutor = (useValues: boolean) =>
						client.executeWithRetry(async () => {
							// Re-resolve raw inside retry to get post-reconnect instance
							const currentRaw = client.raw;
							return currentRaw.begin(async (tx) => {
								const q = tx.unsafe(query, params);
								return useValues ? await q.values() : await q;
							});
						});

					return createThenable(makeTransactionalExecutor);
				}

					const makeExecutor = (useValues: boolean) =>
						client.executeWithRetry(async () => {
							// Re-resolve raw inside retry to get post-reconnect instance
							const currentRaw = client.raw;
							const q = currentRaw.unsafe(query, params);
							return useValues ? q.values() : q;
						});

					return createThenable(makeExecutor);
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

type DrizzleConnectionConfig = string | ({ url?: string } & SQLOptions);

function isCallablePostgresClient(value: unknown): value is CallablePostgresClient {
	return (
		typeof value === 'function' &&
		value !== null &&
		'raw' in (value as CallablePostgresClient) &&
		typeof (value as CallablePostgresClient).executeWithRetry === 'function'
	);
}

function createProxyClientFromSql(client: BunSQLClient): CallablePostgresClient {
	// Bun SQL instances are callable as tagged template literals.
	// Create a function that forwards calls to the client.
	const proxy = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
		// Forward tagged template to the Bun SQL client directly
		return (client as unknown as CallablePostgresClient)(strings, ...values);
	}) as unknown as CallablePostgresClient;

	Object.defineProperties(proxy, {
		raw: {
			get: () => client as InstanceType<typeof BunSQL>,
			enumerable: true,
		},
	});

	proxy.executeWithRetry = async <T>(operation: () => T | Promise<T>) => operation();
	proxy.close = async () => {
		const close = (client as { close?: () => Promise<void> | void }).close;
		if (typeof close === 'function') {
			await close.call(client);
		}
	};

	return proxy;
}

function extractPostgresConfigFromSql(client: BunSQLClient): PostgresConfig | undefined {
	const options = (client as { options?: Record<string, unknown> }).options;
	if (!options || typeof options !== 'object') {
		return undefined;
	}

	const config: PostgresConfig = {};
	const keys = [
		'url',
		'hostname',
		'port',
		'username',
		'password',
		'database',
		'tls',
		'max',
		'idleTimeout',
		'connectionTimeout',
		'prepare',
		'bigint',
		'maxLifetime',
		'path',
		'connection',
	] as const;

	for (const key of keys) {
		if (key in options) {
			(config as Record<string, unknown>)[key] = options[key];
		}
	}

	return Object.keys(config).length > 0 ? config : undefined;
}

function resolvePostgresClient<TClient extends BunSQLClient>(
	client: TClient
): CallablePostgresClient {
	if (isCallablePostgresClient(client)) {
		return client;
	}

	const config = extractPostgresConfigFromSql(client);
	if (config) {
		return postgres(config);
	}

	return createProxyClientFromSql(client);
}

function resolvePostgresClientFromConnection(
	connection?: DrizzleConnectionConfig
): CallablePostgresClient {
	if (!connection) {
		return postgres();
	}

	if (typeof connection === 'string') {
		return postgres(connection);
	}

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;
		return postgres({ url, ...(config as PostgresConfig) });
	}

	return postgres(connection as PostgresConfig);
}

function createDrizzleDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends BunSQLClient = BunSQLClient,
>(
	client: CallablePostgresClient,
	config?: DrizzleConfig<TSchema>
): BunSQLDatabase<TSchema> & {
	$client: TClient;
} {
	const resilientSQL = createResilientSQLProxy(client);
	return upstreamDrizzle({
		client: resilientSQL,
		...(config ?? {}),
	}) as BunSQLDatabase<TSchema> & { $client: TClient };
}

function _drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends BunSQLClient = BunSQLClient,
>(
	...params:
		| [TClient | string]
		| [TClient | string, DrizzleConfig<TSchema>]
		| [DrizzleConfig<TSchema> & ({ connection: DrizzleConnectionConfig } | { client: TClient })]
): BunSQLDatabase<TSchema> & { $client: TClient } {
	if (typeof params[0] === 'string') {
		const client = resolvePostgresClientFromConnection(params[0]);
		return createDrizzleDatabase(client, params[1]);
	}

	if (isConfig(params[0])) {
		const config = params[0] as DrizzleConfig<TSchema> & {
			connection?: DrizzleConnectionConfig;
			client?: TClient;
		};
		const { connection, client, ...drizzleConfig } = config;

		if (client) {
			const resolvedClient = resolvePostgresClient(client);
			return createDrizzleDatabase(resolvedClient, drizzleConfig);
		}

		const resolvedClient = resolvePostgresClientFromConnection(connection);
		return createDrizzleDatabase(resolvedClient, drizzleConfig);
	}

	const client = resolvePostgresClient(params[0] as TClient);
	return createDrizzleDatabase(client, params[1]);
}

_drizzle.mock = <TSchema extends Record<string, unknown> = Record<string, never>>(
	config?: DrizzleConfig<TSchema>
): BunSQLDatabase<TSchema> & { $client: '$client is not available on drizzle.mock()' } => {
	const db = upstreamDrizzle.mock(config);
	(db as unknown as Record<string, unknown>).$client =
		'$client is not available on drizzle.mock()';
	return db as BunSQLDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	};
};

export const drizzle = _drizzle as typeof _drizzle & {
	mock: typeof _drizzle.mock;
};

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
	const db = upstreamDrizzle({
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
