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

	// Create Drizzle instance using the client's raw SQL connection
	// The bun-sql driver accepts a client that implements the Bun.SQL interface
	const db = drizzle({
		client: client.raw,
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
