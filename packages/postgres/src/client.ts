import { SQL as BunSQL, type SQLQuery, type SQL } from 'bun';
import type { PostgresConfig, ConnectionStats, TransactionOptions, ReserveOptions } from './types';
import {
	ConnectionClosedError,
	ReconnectFailedError,
	QueryTimeoutError,
	UnsupportedOperationError,
	isRetryableError,
} from './errors';
import { computeBackoff, sleep, mergeReconnectConfig } from './reconnect';
import { Transaction, ReservedConnection } from './transaction';
import { registerClient, unregisterClient } from './registry';

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
	private _initialized = false; // SQL client created (lazy connection)
	private _connected = false; // Actual TCP connection verified
	private _reconnecting = false;
	private _closed = false;
	private _shuttingDown = false;
	private _signalHandlers: { signal: string; handler: () => void }[] = [];
	private _reconnectPromise: Promise<void> | null = null;
	private _connectPromise: Promise<void> | null = null;

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
	 * Note: By default, the actual TCP connection is established lazily on first query.
	 * The `connected` property will be `false` until a query is executed or
	 * `waitForConnection()` is called. Set `preconnect: true` in config to
	 * establish the connection immediately.
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

		// Initialize the SQL client (lazy - doesn't establish TCP connection yet)
		this._initializeSql();

		// Register shutdown signal handlers to prevent reconnection during app shutdown
		this._registerShutdownHandlers();

		// Register this client in the global registry for coordinated shutdown
		registerClient(this);

		// If preconnect is enabled, establish connection immediately
		if (this._config.preconnect) {
			const p = this._warmConnection();
			// Attach no-op catch to suppress unhandled rejection warnings
			// Later awaits will still observe the real rejection
			p.catch(() => {});
			this._connectPromise = p;
		}
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

		// Mark as connected since we successfully executed a statement
		this._connected = true;

		return new Transaction(sql, connection);
	}

	/**
	 * Reserve an exclusive connection from the pool.
	 *
	 * **Note:** This feature is not currently supported because Bun's SQL driver
	 * does not expose connection-level pooling APIs. The underlying driver manages
	 * connections internally and does not allow reserving a specific connection.
	 *
	 * @param _options - Reserve options (unused)
	 * @throws {UnsupportedOperationError} Always throws - this operation is not supported
	 *
	 * @example
	 * ```typescript
	 * // This will throw UnsupportedOperationError
	 * const conn = await client.reserve();
	 * ```
	 */
	async reserve(_options?: ReserveOptions): Promise<ReservedConnection> {
		throw new UnsupportedOperationError({
			operation: 'reserve',
			reason:
				"Bun's SQL driver does not expose connection-level pooling APIs. " +
				'Use transactions (begin/commit) for operations that require session-level state.',
		});
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

		// Unregister from global registry
		unregisterClient(this);

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
	 * Initializes the internal Bun.SQL client.
	 * Note: This creates the SQL client but doesn't establish the TCP connection yet.
	 * Bun's SQL driver uses lazy connections - the actual TCP connection is made on first query.
	 */
	private _initializeSql(): void {
		if (this._closed || this._initialized) {
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
		if (this._config.idleTimeout !== undefined) bunOptions.idleTimeout = this._config.idleTimeout;
		if (this._config.connectionTimeout !== undefined)
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
		this._initialized = true;
		// Note: _connected remains false until we verify the connection with a query
	}

	/**
	 * Warms the connection by executing a test query.
	 * This establishes the actual TCP connection and verifies it's working.
	 */
	private async _warmConnection(): Promise<void> {
		if (this._closed || this._connected) {
			return;
		}

		if (!this._sql) {
			this._initializeSql();
		}

		// Execute a test query to establish the TCP connection
		// If this fails, the error will propagate to the caller
		await this._sql!`SELECT 1`;
		this._connected = true;
		this._stats.totalConnections++;
		this._stats.lastConnectedAt = new Date();
	}

	/**
	 * Re-initializes the SQL client for reconnection.
	 * Used internally during the reconnection loop.
	 */
	private _reinitializeSql(): void {
		this._initialized = false;
		this._connected = false;
		this._initializeSql();
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

				// Attempt to reconnect - reinitialize and warm the connection
				this._reinitializeSql();
				await this._warmConnection();

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
	 * Ensures the client is initialized and returns the SQL instance.
	 * This is the synchronous version - use _ensureConnectedAsync when you can await.
	 *
	 * Note: This returns the SQL instance even if `_connected` is false because
	 * Bun's SQL uses lazy connections. The actual connection will be established
	 * on first query. Use this for synchronous access to the SQL instance.
	 */
	private _ensureConnected(): InstanceType<typeof BunSQL> {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Client has been closed',
			});
		}

		if (!this._sql) {
			throw new ConnectionClosedError({
				message: 'SQL client not initialized',
				wasReconnecting: this._reconnecting,
			});
		}

		return this._sql;
	}

	/**
	 * Ensures the client is connected and returns the SQL instance.
	 * If reconnection is in progress, waits for it to complete.
	 * If connection hasn't been established yet, warms it first.
	 */
	private async _ensureConnectedAsync(): Promise<InstanceType<typeof BunSQL>> {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Client has been closed',
			});
		}

		// If preconnect is in progress, wait for it
		if (this._connectPromise) {
			try {
				await this._connectPromise;
			} catch (err) {
				this._connectPromise = null;
				throw err;
			}
			this._connectPromise = null;
		}

		// If reconnection is in progress, wait for it to complete
		if (this._reconnecting && this._reconnectPromise) {
			await this._reconnectPromise;
		}

		if (!this._sql) {
			throw new ConnectionClosedError({
				message: 'SQL client not initialized',
				wasReconnecting: false,
			});
		}

		// If not yet connected, warm the connection
		if (!this._connected) {
			await this._warmConnection();
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
				// Wait for preconnect if in progress
				if (this._connectPromise) {
					try {
						await this._connectPromise;
					} catch (err) {
						this._connectPromise = null;
						throw err;
					}
					this._connectPromise = null;
				}

				// Wait for reconnection if in progress
				if (this._reconnecting && this._reconnectPromise) {
					await this._reconnectPromise;
				}

				if (!this._sql) {
					throw new ConnectionClosedError({
						message: 'SQL client not initialized',
						wasReconnecting: this._reconnecting,
					});
				}

				// If not yet connected, warm the connection
				if (!this._connected) {
					await this._warmConnection();
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
	 * If the connection hasn't been established yet (lazy connection), this will
	 * warm the connection by executing a test query.
	 * If reconnection is in progress, waits for it to complete.
	 *
	 * @param timeoutMs - Optional timeout in milliseconds
	 * @throws {ConnectionClosedError} If the client has been closed or connection fails
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

		const connectOperation = async () => {
			// Wait for preconnect if in progress
			if (this._connectPromise) {
				try {
					await this._connectPromise;
				} catch (err) {
					this._connectPromise = null;
					throw err;
				}
				this._connectPromise = null;
			}

			// Wait for reconnection if in progress
			if (this._reconnecting && this._reconnectPromise) {
				await this._reconnectPromise;
			}

			// If still not connected, warm the connection
			if (!this._connected && this._sql) {
				await this._warmConnection();
			}

			if (!this._connected || !this._sql) {
				throw new ConnectionClosedError({
					message: 'Failed to establish connection',
				});
			}
		};

		if (timeoutMs !== undefined) {
			let timerId: ReturnType<typeof setTimeout> | undefined;
			const timeoutPromise = new Promise<never>((_, reject) => {
				timerId = setTimeout(
					() =>
						reject(
							new QueryTimeoutError({
								timeoutMs,
							})
						),
					timeoutMs
				);
			});
			try {
				await Promise.race([connectOperation(), timeoutPromise]);
			} finally {
				if (timerId !== undefined) {
					clearTimeout(timerId);
				}
			}
		} else {
			await connectOperation();
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
