import { SQL as BunSQL, type SQLQuery, type SQL } from 'bun';
import type { PostgresConfig, ConnectionStats, TransactionOptions, ReserveOptions } from './types';
import { ConnectionClosedError, ReconnectFailedError, isRetryableError } from './errors';
import { computeBackoff, sleep, mergeReconnectConfig } from './reconnect';
import { Transaction, ReservedConnection } from './transaction';

/**
 * Bun SQL options for PostgreSQL connections.
 * We use a type assertion since the Bun types are a union of SQLite and Postgres options.
 */
type BunPostgresOptions = SQL.PostgresOrMySQLOptions;

/**
 * A resilient PostgreSQL client with automatic reconnection.
 *
 * Wraps Bun's native SQL driver and adds:
 * - Automatic reconnection with exponential backoff
 * - Connection state tracking
 * - Transaction support
 * - Reserved connection support
 *
 * Can be used as a tagged template literal for queries:
 *
 * @example
 * ```typescript
 * const client = new PostgresClient();
 *
 * // Simple query
 * const users = await client`SELECT * FROM users`;
 *
 * // Parameterized query
 * const user = await client`SELECT * FROM users WHERE id = ${userId}`;
 *
 * // Transaction
 * const tx = await client.begin();
 * await tx`INSERT INTO users (name) VALUES (${name})`;
 * await tx.commit();
 * ```
 */
export class PostgresClient {
	private _sql: InstanceType<typeof BunSQL> | null = null;
	private _config: PostgresConfig;
	private _connected = false;
	private _reconnecting = false;
	private _closed = false;
	private _shuttingDown = false;
	private _signalHandlers: { signal: string; handler: () => void }[] = [];
	private _reconnectPromise: Promise<void> | null = null;

	private _stats: ConnectionStats = {
		connected: false,
		reconnecting: false,
		totalConnections: 0,
		reconnectAttempts: 0,
		failedReconnects: 0,
		lastConnectedAt: null,
		lastDisconnectedAt: null,
		lastReconnectAttemptAt: null,
	};

	/**
	 * Creates a new PostgresClient.
	 *
	 * @param config - Connection configuration. Can be a connection URL string or a config object.
	 *                 If not provided, uses `process.env.DATABASE_URL`.
	 */
	constructor(config?: string | PostgresConfig) {
		if (typeof config === 'string') {
			this._config = { url: config };
		} else {
			this._config = config ?? {};
		}

		// Initialize connection
		this._connect();

		// Register shutdown signal handlers to prevent reconnection during app shutdown
		this._registerShutdownHandlers();
	}

	/**
	 * Whether the client is currently connected.
	 */
	get connected(): boolean {
		return this._connected;
	}

	/**
	 * Whether the client is shutting down (won't attempt reconnection).
	 */
	get shuttingDown(): boolean {
		return this._shuttingDown;
	}

	/**
	 * Whether a reconnection attempt is in progress.
	 */
	get reconnecting(): boolean {
		return this._reconnecting;
	}

	/**
	 * Connection statistics.
	 */
	get stats(): Readonly<ConnectionStats> {
		return {
			...this._stats,
			connected: this._connected,
			reconnecting: this._reconnecting,
		};
	}

	/**
	 * Execute a query using tagged template literal syntax.
	 * If reconnection is in progress, waits for it to complete before executing.
	 * Automatically retries on retryable errors.
	 *
	 * @example
	 * ```typescript
	 * const users = await client`SELECT * FROM users WHERE active = ${true}`;
	 * ```
	 */
	query(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
		return this._executeWithRetry(async () => {
			const sql = await this._ensureConnectedAsync();
			return sql(strings, ...values);
		});
	}

	/**
	 * Begin a new transaction.
	 *
	 * @param options - Transaction options (isolation level, read-only, deferrable)
	 * @returns A Transaction object for executing queries within the transaction
	 *
	 * @example
	 * ```typescript
	 * const tx = await client.begin();
	 * try {
	 *   await tx`INSERT INTO users (name) VALUES (${name})`;
	 *   await tx`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`;
	 *   await tx.commit();
	 * } catch (error) {
	 *   await tx.rollback();
	 *   throw error;
	 * }
	 * ```
	 */
	async begin(options?: TransactionOptions): Promise<Transaction> {
		const sql = this._ensureConnected();

		// Build BEGIN statement with options
		let beginStatement = 'BEGIN';

		if (options?.isolationLevel) {
			beginStatement += ` ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`;
		}

		if (options?.readOnly) {
			beginStatement += ' READ ONLY';
		} else if (options?.readOnly === false) {
			beginStatement += ' READ WRITE';
		}

		if (options?.deferrable === true) {
			beginStatement += ' DEFERRABLE';
		} else if (options?.deferrable === false) {
			beginStatement += ' NOT DEFERRABLE';
		}

		// Execute BEGIN
		const connection = await sql.unsafe(beginStatement);

		return new Transaction(sql, connection);
	}

	/**
	 * Reserve an exclusive connection from the pool.
	 *
	 * Use this when you need to execute multiple statements that must run
	 * on the same connection (e.g., SET LOCAL, LISTEN/NOTIFY).
	 *
	 * @param options - Reserve options
	 * @returns A ReservedConnection object
	 *
	 * @example
	 * ```typescript
	 * const conn = await client.reserve();
	 * try {
	 *   await conn`SET LOCAL timezone = 'UTC'`;
	 *   const result = await conn`SELECT NOW()`;
	 * } finally {
	 *   conn.release();
	 * }
	 * ```
	 */
	async reserve(_options?: ReserveOptions): Promise<ReservedConnection> {
		const sql = this._ensureConnected();

		// Bun.SQL doesn't have explicit connection reservation,
		// but we can create a new SQL instance for exclusive use
		// For now, we return a wrapper around the main SQL instance
		// In a real implementation, this would acquire a dedicated connection

		return new ReservedConnection(sql);
	}

	/**
	 * Signal that the application is shutting down.
	 * This prevents reconnection attempts but doesn't immediately close the connection.
	 * Use this when you want to gracefully drain connections before calling close().
	 */
	shutdown(): void {
		this._shuttingDown = true;
	}

	/**
	 * Close the client and release all connections.
	 */
	async close(): Promise<void> {
		this._closed = true;
		this._shuttingDown = true; // Also set shuttingDown to prevent any race conditions
		this._connected = false;
		this._reconnecting = false;

		// Remove signal handlers
		this._removeShutdownHandlers();

		if (this._sql) {
			await this._sql.close();
			this._sql = null;
		}
	}

	/**
	 * Access to raw SQL methods for advanced use cases.
	 * Returns the underlying Bun.SQL instance.
	 */
	get raw(): InstanceType<typeof BunSQL> {
		return this._ensureConnected();
	}

	/**
	 * Execute an unsafe (unparameterized) query.
	 * Use with caution - this bypasses SQL injection protection.
	 *
	 * @param query - The raw SQL query string
	 */
	unsafe(query: string): SQLQuery {
		const sql = this._ensureConnected();
		return sql.unsafe(query);
	}

	/**
	 * Registers signal handlers to detect application shutdown.
	 * When shutdown is detected, reconnection is disabled.
	 */
	private _registerShutdownHandlers(): void {
		const shutdownHandler = () => {
			this._shuttingDown = true;
		};

		// Listen for common shutdown signals
		const signals = ['SIGTERM', 'SIGINT'] as const;
		for (const signal of signals) {
			process.on(signal, shutdownHandler);
			this._signalHandlers.push({ signal, handler: shutdownHandler });
		}
	}

	/**
	 * Removes signal handlers registered for shutdown detection.
	 */
	private _removeShutdownHandlers(): void {
		for (const { signal, handler } of this._signalHandlers) {
			process.off(signal, handler);
		}
		this._signalHandlers = [];
	}

	/**
	 * Creates the internal Bun.SQL connection.
	 */
	private _connect(): void {
		if (this._closed) {
			return;
		}

		const url = this._config.url ?? process.env.DATABASE_URL;

		// Build Bun.SQL options - use type assertion since Bun types are a union
		const bunOptions: BunPostgresOptions = {
			adapter: 'postgres',
		};

		if (url) {
			bunOptions.url = url;
		}

		if (this._config.hostname) bunOptions.hostname = this._config.hostname;
		if (this._config.port) bunOptions.port = this._config.port;
		if (this._config.username) bunOptions.username = this._config.username;
		if (this._config.password) bunOptions.password = this._config.password;
		if (this._config.database) bunOptions.database = this._config.database;
		if (this._config.max) bunOptions.max = this._config.max;
		if (this._config.idleTimeout) bunOptions.idleTimeout = this._config.idleTimeout;
		if (this._config.connectionTimeout)
			bunOptions.connectionTimeout = this._config.connectionTimeout;

		// Handle TLS configuration
		if (this._config.tls !== undefined) {
			if (typeof this._config.tls === 'boolean') {
				bunOptions.tls = this._config.tls;
			} else {
				bunOptions.tls = this._config.tls;
			}
		}

		// Set up onclose handler for reconnection
		bunOptions.onclose = (err: Error | null) => {
			this._handleClose(err ?? undefined);
		};

		this._sql = new BunSQL(bunOptions);
		this._connected = true;
		this._stats.totalConnections++;
		this._stats.lastConnectedAt = new Date();
	}

	/**
	 * Handles connection close events.
	 */
	private _handleClose(error?: Error): void {
		const wasConnected = this._connected;
		this._connected = false;
		this._stats.lastDisconnectedAt = new Date();

		// Call user's onclose callback
		this._config.onclose?.(error);

		// Don't reconnect if explicitly closed OR if application is shutting down
		if (this._closed || this._shuttingDown) {
			return;
		}

		// Check if reconnection is enabled
		const reconnectConfig = mergeReconnectConfig(this._config.reconnect);
		if (!reconnectConfig.enabled) {
			return;
		}

		// If there's an error, check if it's retryable
		// If there's NO error (graceful close), still attempt reconnection
		if (error && !isRetryableError(error)) {
			return;
		}

		// Start reconnection if not already in progress
		if (!this._reconnecting && wasConnected) {
			this._startReconnect();
		}
	}

	/**
	 * Starts the reconnection process.
	 */
	private _startReconnect(): void {
		if (this._reconnecting || this._closed || this._shuttingDown) {
			return;
		}

		this._reconnecting = true;
		this._reconnectPromise = this._reconnectLoop();
	}

	/**
	 * The main reconnection loop with exponential backoff.
	 */
	private async _reconnectLoop(): Promise<void> {
		const config = mergeReconnectConfig(this._config.reconnect);
		let attempt = 0;
		let lastError: Error | undefined;

		while (attempt < config.maxAttempts && !this._closed && !this._shuttingDown) {
			this._stats.reconnectAttempts++;
			this._stats.lastReconnectAttemptAt = new Date();

			// Notify about reconnection attempt
			this._config.onreconnect?.(attempt + 1);

			// Calculate backoff delay
			const delay = computeBackoff(attempt, config);

			// Wait before attempting
			await sleep(delay);

			if (this._closed) {
				break;
			}

			try {
				// Close existing connection if any
				if (this._sql) {
					try {
						await this._sql.close();
					} catch {
						// Ignore close errors
					}
					this._sql = null;
				}

				// Attempt to reconnect
				this._connect();

				// Test the connection with a simple query
				await this._sql!`SELECT 1`;

				// Success!
				this._reconnecting = false;
				this._reconnectPromise = null;
				this._config.onreconnected?.();
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				this._stats.failedReconnects++;
				attempt++;
			}
		}

		// All attempts failed
		this._reconnecting = false;
		this._reconnectPromise = null;

		const finalError = new ReconnectFailedError({
			attempts: attempt,
			lastError,
		});

		this._config.onreconnectfailed?.(finalError);
	}

	/**
	 * Ensures the client is connected and returns the SQL instance.
	 * This is the synchronous version - use _ensureConnectedAsync when you can await.
	 */
	private _ensureConnected(): InstanceType<typeof BunSQL> {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Client has been closed',
			});
		}

		if (!this._sql || !this._connected) {
			throw new ConnectionClosedError({
				message: 'Not connected to database',
				wasReconnecting: this._reconnecting,
			});
		}

		return this._sql;
	}

	/**
	 * Ensures the client is connected and returns the SQL instance.
	 * If reconnection is in progress, waits for it to complete.
	 */
	private async _ensureConnectedAsync(): Promise<InstanceType<typeof BunSQL>> {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Client has been closed',
			});
		}

		// If reconnection is in progress, wait for it to complete
		if (this._reconnecting && this._reconnectPromise) {
			await this._reconnectPromise;
		}

		if (!this._sql || !this._connected) {
			throw new ConnectionClosedError({
				message: 'Not connected to database',
				wasReconnecting: false,
			});
		}

		return this._sql;
	}

	/**
	 * Executes an operation with retry logic for retryable errors.
	 * Waits for reconnection if one is in progress.
	 */
	private async _executeWithRetry<T>(
		operation: () => T | Promise<T>,
		maxRetries: number = 3
	): Promise<T> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				// Wait for connection if reconnecting
				if (this._reconnecting && this._reconnectPromise) {
					await this._reconnectPromise;
				}

				if (!this._sql || !this._connected) {
					throw new ConnectionClosedError({
						message: 'Not connected to database',
						wasReconnecting: this._reconnecting,
					});
				}

				return await operation();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// If it's a retryable error and we have retries left, wait and retry
				if (isRetryableError(error) && attempt < maxRetries) {
					// Wait for reconnection to complete if it started
					if (this._reconnecting && this._reconnectPromise) {
						try {
							await this._reconnectPromise;
						} catch {
							// Reconnection failed, will throw below
						}
					}
					continue;
				}

				throw error;
			}
		}

		throw lastError;
	}

	/**
	 * Wait for the connection to be established.
	 * Useful when you want to wait for reconnection to complete.
	 */
	async waitForConnection(timeoutMs?: number): Promise<void> {
		if (this._connected && this._sql) {
			return;
		}

		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Client has been closed',
			});
		}

		if (this._reconnecting && this._reconnectPromise) {
			if (timeoutMs) {
				const timeout = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
				});
				await Promise.race([this._reconnectPromise, timeout]);
			} else {
				await this._reconnectPromise;
			}
		}

		if (!this._connected || !this._sql) {
			throw new ConnectionClosedError({
				message: 'Not connected to database',
			});
		}
	}
}

/**
 * Type for the callable PostgresClient that supports tagged template literals.
 */
export type CallablePostgresClient = PostgresClient & {
	(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

/**
 * Creates a PostgresClient that can be called as a tagged template literal.
 *
 * @param config - Connection configuration
 * @returns A callable PostgresClient
 *
 * @internal
 */
export function createCallableClient(config?: string | PostgresConfig): CallablePostgresClient {
	const client = new PostgresClient(config);

	// Create a callable function that delegates to client.query
	const callable = function (
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<unknown[]> {
		return client.query(strings, ...values);
	} as unknown as CallablePostgresClient;

	// Copy all properties and methods from the client to the callable
	Object.setPrototypeOf(callable, PostgresClient.prototype);

	// Define properties that delegate to the client
	Object.defineProperties(callable, {
		connected: {
			get: () => client.connected,
			enumerable: true,
		},
		reconnecting: {
			get: () => client.reconnecting,
			enumerable: true,
		},
		shuttingDown: {
			get: () => client.shuttingDown,
			enumerable: true,
		},
		stats: {
			get: () => client.stats,
			enumerable: true,
		},
		raw: {
			get: () => client.raw,
			enumerable: true,
		},
	});

	// Bind methods to the client
	callable.query = client.query.bind(client);
	callable.begin = client.begin.bind(client);
	callable.reserve = client.reserve.bind(client);
	callable.close = client.close.bind(client);
	callable.shutdown = client.shutdown.bind(client);
	callable.unsafe = client.unsafe.bind(client);
	callable.waitForConnection = client.waitForConnection.bind(client);

	return callable;
}
