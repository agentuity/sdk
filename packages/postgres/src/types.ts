import type pg from 'pg';

export type UnsafeQueryResult = {
	then: Promise<unknown>['then'];
	catch: Promise<unknown>['catch'];
	finally: Promise<unknown>['finally'];
	values: () => Promise<unknown>;
};

/**
 * TLS configuration options for PostgreSQL connections.
 */
export interface TLSConfig {
	/**
	 * Whether to require TLS for the connection.
	 * - `true`: Require TLS (fail if not available)
	 * - `false`: Disable TLS
	 * - `'prefer'`: Use TLS if available, fall back to unencrypted
	 */
	require?: boolean | 'prefer';

	/**
	 * Whether to reject unauthorized certificates.
	 * Set to `false` to allow self-signed certificates.
	 */
	rejectUnauthorized?: boolean;

	/**
	 * CA certificate(s) for verifying the server certificate.
	 */
	ca?: string | Buffer | (string | Buffer)[];

	/**
	 * Client certificate for mutual TLS authentication.
	 */
	cert?: string | Buffer;

	/**
	 * Client private key for mutual TLS authentication.
	 */
	key?: string | Buffer;
}

/**
 * Configuration for automatic reconnection behavior.
 */
export interface ReconnectConfig {
	/**
	 * Maximum number of reconnection attempts before giving up.
	 * @default 10
	 */
	maxAttempts?: number;

	/**
	 * Initial delay in milliseconds before the first reconnection attempt.
	 * @default 100
	 */
	initialDelayMs?: number;

	/**
	 * Maximum delay in milliseconds between reconnection attempts.
	 * @default 30000
	 */
	maxDelayMs?: number;

	/**
	 * Multiplier for exponential backoff.
	 * @default 2
	 */
	multiplier?: number;

	/**
	 * Maximum random jitter in milliseconds to add to the delay.
	 * Helps prevent thundering herd problems.
	 * @default 1000
	 */
	jitterMs?: number;

	/**
	 * Whether to automatically reconnect on connection loss.
	 * @default true
	 */
	enabled?: boolean;
}

/**
 * Statistics about the connection state and reconnection history.
 */
export interface ConnectionStats {
	/**
	 * Whether the client is currently connected.
	 */
	connected: boolean;

	/**
	 * Whether a reconnection attempt is in progress.
	 */
	reconnecting: boolean;

	/**
	 * Total number of successful connections (including reconnections).
	 */
	totalConnections: number;

	/**
	 * Total number of reconnection attempts.
	 */
	reconnectAttempts: number;

	/**
	 * Total number of failed reconnection attempts.
	 */
	failedReconnects: number;

	/**
	 * Timestamp of the last successful connection.
	 */
	lastConnectedAt: Date | null;

	/**
	 * Timestamp of the last disconnection.
	 */
	lastDisconnectedAt: Date | null;

	/**
	 * Timestamp of the last reconnection attempt.
	 */
	lastReconnectAttemptAt: Date | null;
}

/**
 * PostgreSQL connection configuration options.
 * Extends Bun.SQL options with reconnection configuration.
 */
export interface PostgresConfig {
	/**
	 * PostgreSQL connection URL.
	 * If not provided, uses `process.env.DATABASE_URL`.
	 */
	url?: string;

	/**
	 * Database hostname.
	 */
	hostname?: string;

	/**
	 * Database port.
	 * @default 5432
	 */
	port?: number;

	/**
	 * Database username.
	 */
	username?: string;

	/**
	 * Database password for authentication.
	 * Can be a string or a function that returns the password (sync or async).
	 * Using a function enables rotating credentials (e.g., AWS RDS IAM tokens,
	 * GCP Cloud SQL IAM authentication).
	 */
	password?: string | (() => string | Promise<string>);

	/**
	 * Database name.
	 */
	database?: string;

	/**
	 * Unix domain socket path for local PostgreSQL connections.
	 * Alternative to hostname/port for same-machine connections.
	 *
	 * @example '/var/run/postgresql/.s.PGSQL.5432'
	 */
	path?: string;

	/**
	 * TLS configuration.
	 */
	tls?: TLSConfig | boolean;

	/**
	 * PostgreSQL client runtime configuration parameters sent during
	 * connection startup.
	 *
	 * These correspond to PostgreSQL runtime configuration settings.
	 *
	 * @see https://www.postgresql.org/docs/current/runtime-config-client.html
	 *
	 * @example
	 * ```typescript
	 * {
	 *   search_path: 'myapp,public',
	 *   statement_timeout: '30s',
	 *   application_name: 'my-service',
	 *   timezone: 'UTC',
	 * }
	 * ```
	 */
	connection?: Record<string, string | boolean | number>;

	/**
	 * Maximum number of connections in the pool.
	 * @default 10
	 */
	max?: number;

	/**
	 * Connection timeout in milliseconds.
	 * @default 30000
	 */
	connectionTimeout?: number;

	/**
	 * Idle timeout in milliseconds.
	 * @default 0 (no timeout)
	 */
	idleTimeout?: number;

	/**
	 * Maximum lifetime of a connection in seconds.
	 * After this time, the connection is closed and a new one is created.
	 * Set to `0` for no maximum lifetime.
	 *
	 * This is useful in pooled environments to prevent stale connections
	 * and coordinate with connection pooler behavior.
	 *
	 * @default 0 (no maximum lifetime)
	 */
	maxLifetime?: number;

	/**
	 * Whether to use named prepared statements.
	 *
	 * When `true`, Bun's SQL driver caches named prepared statements on the
	 * server for better performance with repeated queries.
	 *
	 * When `false`, queries use unnamed prepared statements that are parsed
	 * fresh each time. This is required when using connection poolers like
	 * PGBouncer (in transaction mode) or Supavisor, where the backend
	 * connection may change between queries, invalidating cached statements.
	 *
	 * @default false
	 */
	prepare?: boolean;

	/**
	 * Whether to return large integers as BigInt instead of strings.
	 *
	 * When `true`, integers outside the i32 range are returned as `BigInt`.
	 * When `false`, they are returned as strings.
	 *
	 * @default false
	 */
	bigint?: boolean;

	/**
	 * Reconnection configuration.
	 */
	reconnect?: ReconnectConfig;

	/**
	 * Whether to establish a connection immediately on client creation.
	 * If true, the client will execute a test query (SELECT 1) to verify
	 * the connection is working. If false (default), the connection is
	 * established lazily on first query.
	 *
	 * Note: Even with preconnect=false, the underlying Bun.SQL client is
	 * created immediately, but the actual TCP connection is deferred.
	 *
	 * @default false
	 */
	preconnect?: boolean;

	/**
	 * Callback invoked when a connection attempt completes.
	 * Receives an Error on failure, or null on success.
	 */
	onconnect?: (error: Error | null) => void;

	/**
	 * Callback invoked when the connection is closed.
	 */
	onclose?: (error?: Error) => void;

	/**
	 * Callback invoked when reconnection starts.
	 */
	onreconnect?: (attempt: number) => void;

	/**
	 * Callback invoked when reconnection succeeds.
	 */
	onreconnected?: () => void;

	/**
	 * Callback invoked when reconnection fails permanently.
	 */
	onreconnectfailed?: (error: Error) => void;
}

/**
 * Options for creating a transaction.
 */
export interface TransactionOptions {
	/**
	 * Transaction isolation level.
	 */
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';

	/**
	 * Whether the transaction is read-only.
	 */
	readOnly?: boolean;

	/**
	 * Whether the transaction is deferrable.
	 * Only applicable for serializable read-only transactions.
	 */
	deferrable?: boolean;
}

/**
 * Options for reserving a connection.
 */
export interface ReserveOptions {
	/**
	 * Timeout in milliseconds for acquiring a connection from the pool.
	 */
	timeout?: number;
}

/**
 * SSL configuration for pg.Pool connections.
 */
export interface PoolSSLConfig {
	/**
	 * Whether to reject unauthorized certificates.
	 * Set to `false` to allow self-signed certificates.
	 */
	rejectUnauthorized?: boolean;

	/**
	 * CA certificate(s) for verifying the server certificate.
	 */
	ca?: string | Buffer | (string | Buffer)[];

	/**
	 * Client certificate for mutual TLS authentication.
	 */
	cert?: string | Buffer;

	/**
	 * Client private key for mutual TLS authentication.
	 */
	key?: string | Buffer;
}

/**
 * Configuration options for PostgresPool.
 * Extends standard pg.Pool options with reconnection support.
 */
export interface PoolConfig extends pg.PoolConfig {
	/**
	 * SSL configuration.
	 * Set to `true` to enable SSL with default settings.
	 * Set to an object to configure SSL options.
	 * Set to `false` or omit to disable SSL.
	 */
	ssl?: pg.PoolConfig['ssl'] | PoolSSLConfig;

	/**
	 * Reconnection configuration.
	 */
	reconnect?: ReconnectConfig;

	/**
	 * Whether to establish a connection immediately on pool creation.
	 * If true, the pool will verify connectivity by acquiring and releasing a client.
	 * If false (default), the first connection is made lazily on first query.
	 *
	 * @default false
	 */
	preconnect?: boolean;

	/**
	 * Callback invoked when the pool encounters an error.
	 */
	onclose?: (error?: Error) => void;

	/**
	 * Callback invoked when reconnection starts.
	 */
	onreconnect?: (attempt: number) => void;

	/**
	 * Callback invoked when reconnection succeeds.
	 */
	onreconnected?: () => void;

	/**
	 * Callback invoked when reconnection fails permanently.
	 */
	onreconnectfailed?: (error: Error) => void;
}

/**
 * Statistics about the pool state and reconnection history.
 */
export interface PoolStats {
	/**
	 * Whether the pool is currently connected.
	 */
	connected: boolean;

	/**
	 * Whether a reconnection attempt is in progress.
	 */
	reconnecting: boolean;

	/**
	 * Total number of clients in the pool.
	 */
	totalCount: number;

	/**
	 * Number of idle clients in the pool.
	 */
	idleCount: number;

	/**
	 * Number of clients currently waiting to be acquired.
	 */
	waitingCount: number;

	/**
	 * Total number of successful connections (including reconnections).
	 */
	totalConnections: number;

	/**
	 * Total number of reconnection attempts.
	 */
	reconnectAttempts: number;

	/**
	 * Total number of failed reconnection attempts.
	 */
	failedReconnects: number;

	/**
	 * Timestamp of the last successful connection.
	 */
	lastConnectedAt: Date | null;

	/**
	 * Timestamp of the last disconnection.
	 */
	lastDisconnectedAt: Date | null;

	/**
	 * Timestamp of the last reconnection attempt.
	 */
	lastReconnectAttemptAt: Date | null;
}
