import type { Logger as DrizzleLogger } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';
import type { PostgresConfig, ReconnectConfig, CallablePostgresClient } from '@agentuity/postgres';

/**
 * Configuration options for creating a PostgreSQL Drizzle instance.
 *
 * @template TSchema - The Drizzle schema type
 */
export interface PostgresDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
> {
	/**
	 * PostgreSQL connection string.
	 * If not provided, uses `process.env.DATABASE_URL`.
	 */
	connectionString?: string;

	/**
	 * Full PostgreSQL connection configuration.
	 * Takes precedence over `connectionString` if both are provided.
	 */
	connection?: PostgresConfig;

	/**
	 * Drizzle schema for type-safe queries.
	 */
	schema?: TSchema;

	/**
	 * Enable query logging.
	 * - `true`: Use default console logger
	 * - `DrizzleLogger`: Custom logger implementation
	 */
	logger?: boolean | DrizzleLogger;

	/**
	 * Reconnection configuration passed to the underlying postgres client.
	 */
	reconnect?: ReconnectConfig;

	/**
	 * Callback invoked when the initial connection is established.
	 */
	onConnect?: () => void;

	/**
	 * Callback invoked when the connection is re-established after a disconnect.
	 */
	onReconnected?: () => void;
}

/**
 * The result of creating a PostgreSQL Drizzle instance.
 *
 * @template TSchema - The Drizzle schema type
 */
export interface PostgresDrizzle<TSchema extends Record<string, unknown> = Record<string, never>> {
	/**
	 * The Drizzle database instance for executing queries.
	 */
	db: BunSQLDatabase<TSchema>;

	/**
	 * The underlying PostgreSQL client with reconnection support.
	 * Can be used for raw queries or accessing connection state.
	 */
	client: CallablePostgresClient;

	/**
	 * Closes the database connection and releases resources.
	 */
	close: () => Promise<void>;
}
