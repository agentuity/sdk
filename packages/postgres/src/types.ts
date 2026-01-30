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
	 * Database password.
	 */
	password?: string;

	/**
	 * Database name.
	 */
	database?: string;

	/**
	 * TLS configuration.
	 */
	tls?: TLSConfig | boolean;

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
	 * Reconnection configuration.
	 */
	reconnect?: ReconnectConfig;

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
