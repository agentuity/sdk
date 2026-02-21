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
	 * PostgreSQL connection URL.
	 * Shorthand for `connection.url`.
	 * If not provided, falls back to `connectionString`, then `process.env.DATABASE_URL`.
	 */
	url?: string;

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
	 * Whether to use named prepared statements for the underlying connection.
	 *
	 * When `false` (default), queries use unnamed prepared statements that
	 * are safe for connection poolers (PGBouncer, Supavisor) and
	 * environments where backend connections may rotate.
	 *
	 * When `true`, enables named prepared statement caching for better
	 * performance with repeated queries, but requires a stable backend
	 * connection.
	 *
	 * @default false
	 */
	prepare?: boolean;

	/**
	 * Whether to return large integers as BigInt instead of strings.
	 *
	 * When `true`, integers outside the i32 range are returned as `BigInt`.
	 * When `false` (default), they are returned as strings.
	 *
	 * @default false
	 */
	bigint?: boolean;

	/**
	 * Maximum lifetime of a connection in seconds.
	 * After this time, the connection is closed and a new one is created.
	 * Set to `0` for no maximum lifetime.
	 *
	 * @default 0 (no maximum lifetime)
	 */
	maxLifetime?: number;

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
