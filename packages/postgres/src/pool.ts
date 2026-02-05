import pg from 'pg';
import type { PoolConfig, PoolStats } from './types';
import {
	ConnectionClosedError,
	PostgresError,
	QueryTimeoutError,
	ReconnectFailedError,
	isRetryableError,
} from './errors';
import { computeBackoff, sleep, mergeReconnectConfig } from './reconnect';
import { registerClient, unregisterClient, type Registrable } from './registry';

/**
 * A resilient PostgreSQL connection pool with automatic reconnection.
 *
 * Wraps the `pg` package's Pool and adds:
 * - Automatic reconnection with exponential backoff
 * - Connection state tracking
 * - Pool statistics
 *
 * @example
 * ```typescript
 * const pool = new PostgresPool({
 *   connectionString: process.env.DATABASE_URL,
 *   max: 20,
 *   reconnect: { maxAttempts: 5 }
 * });
 *
 * // Execute queries
 * const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
 *
 * // Close when done
 * await pool.close();
 * ```
 */
export class PostgresPool implements Registrable {
	private _pool: pg.Pool | null = null;
	private _config: PoolConfig;
	private _connected = false;
	private _reconnecting = false;
	private _closed = false;
	private _shuttingDown = false;
	private _signalHandlers: { signal: string; handler: () => void }[] = [];
	private _reconnectPromise: Promise<void> | null = null;
	private _connectPromise: Promise<void> | null = null;

	private _stats: Omit<
		PoolStats,
		'connected' | 'reconnecting' | 'totalCount' | 'idleCount' | 'waitingCount'
	> = {
		totalConnections: 0,
		reconnectAttempts: 0,
		failedReconnects: 0,
		lastConnectedAt: null,
		lastDisconnectedAt: null,
		lastReconnectAttemptAt: null,
	};

	/**
	 * Creates a new PostgresPool.
	 *
	 * Note: By default, the actual connection is established lazily on first query.
	 * Set `preconnect: true` in config to verify connectivity immediately.
	 *
	 * @param config - Connection configuration. Can be a connection URL string or a config object.
	 *                 If not provided, uses `process.env.DATABASE_URL`.
	 */
	constructor(config?: string | PoolConfig) {
		if (typeof config === 'string') {
			this._config = { connectionString: config };
		} else {
			this._config = config ?? {};
		}

		// Initialize the pool
		this._initializePool();

		// Register shutdown signal handlers to prevent reconnection during app shutdown
		this._registerShutdownHandlers();

		// Register this pool in the global registry for coordinated shutdown
		registerClient(this);

		// If preconnect is enabled, establish connection immediately
		if (this._config.preconnect) {
			const p = this._warmConnection();
			// Attach no-op catch to suppress unhandled rejection warnings
			p.catch(() => {});
			this._connectPromise = p;
		}
	}

	/**
	 * Whether the pool is currently connected.
	 */
	get connected(): boolean {
		return this._connected;
	}

	/**
	 * Whether the pool is shutting down (won't attempt reconnection).
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
	 * Pool statistics.
	 */
	get stats(): Readonly<PoolStats> {
		return {
			...this._stats,
			connected: this._connected,
			reconnecting: this._reconnecting,
			totalCount: this._pool?.totalCount ?? 0,
			idleCount: this._pool?.idleCount ?? 0,
			waitingCount: this._pool?.waitingCount ?? 0,
		};
	}

	/**
	 * Execute a query on the pool.
	 * If reconnection is in progress, waits for it to complete before executing.
	 * Automatically retries on retryable errors.
	 *
	 * @param text - The query string or query config object
	 * @param values - Optional array of parameter values
	 * @returns The query result
	 *
	 * @example
	 * ```typescript
	 * const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
	 * console.log(result.rows);
	 * ```
	 */
	async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
		text: string | pg.QueryConfig<unknown[]>,
		values?: unknown[]
	): Promise<pg.QueryResult<T>> {
		return this._executeWithRetry(async () => {
			const pool = await this._ensureConnectedAsync();
			return pool.query<T>(text, values);
		});
	}

	/**
	 * Acquire a client from the pool.
	 * The client must be released back to the pool when done.
	 *
	 * @returns A pooled client
	 *
	 * @example
	 * ```typescript
	 * const client = await pool.connect();
	 * try {
	 *   await client.query('BEGIN');
	 *   await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
	 *   await client.query('COMMIT');
	 * } catch (error) {
	 *   await client.query('ROLLBACK');
	 *   throw error;
	 * } finally {
	 *   client.release();
	 * }
	 * ```
	 */
	async connect(): Promise<pg.PoolClient> {
		return this._executeWithRetry(async () => {
			const pool = await this._ensureConnectedAsync();
			return pool.connect();
		});
	}

	/**
	 * Signal that the application is shutting down.
	 * This prevents reconnection attempts but doesn't immediately close the pool.
	 * Use this when you want to gracefully drain connections before calling close().
	 */
	shutdown(): void {
		this._shuttingDown = true;
	}

	/**
	 * Close the pool and release all connections.
	 * Alias for end() for compatibility with PostgresClient.
	 */
	async close(): Promise<void> {
		return this.end();
	}

	/**
	 * Close the pool and release all connections.
	 */
	async end(): Promise<void> {
		this._closed = true;
		this._shuttingDown = true;
		this._connected = false;
		this._reconnecting = false;

		// Remove signal handlers
		this._removeShutdownHandlers();

		// Unregister from global registry
		unregisterClient(this);

		if (this._pool) {
			await this._pool.end();
			this._pool = null;
		}
	}

	/**
	 * Access to the raw pg.Pool instance for advanced use cases.
	 * Returns the underlying pg.Pool instance.
	 */
	get raw(): pg.Pool {
		return this._ensureConnected();
	}

	/**
	 * Wait for the connection to be established.
	 * If the connection hasn't been established yet (lazy connection), this will
	 * warm the connection by acquiring and releasing a client.
	 * If reconnection is in progress, waits for it to complete.
	 *
	 * @param timeoutMs - Optional timeout in milliseconds
	 * @throws {ConnectionClosedError} If the pool has been closed or connection fails
	 */
	async waitForConnection(timeoutMs?: number): Promise<void> {
		if (this._connected && this._pool) {
			return;
		}

		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Pool has been closed',
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
			if (!this._connected && this._pool) {
				await this._warmConnection();
			}

			if (!this._connected || !this._pool) {
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

	/**
	 * Registers signal handlers to detect application shutdown.
	 * When shutdown is detected, reconnection is disabled.
	 */
	private _registerShutdownHandlers(): void {
		const shutdownHandler = () => {
			this._shuttingDown = true;
		};

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
	 * Initializes the pg.Pool instance.
	 */
	private _initializePool(): void {
		if (this._closed || this._pool) {
			return;
		}

		const connectionString = this._config.connectionString ?? process.env.DATABASE_URL;

		const poolConfig: pg.PoolConfig = {};

		if (connectionString) {
			poolConfig.connectionString = connectionString;
		}

		if (this._config.host) poolConfig.host = this._config.host;
		if (this._config.port) poolConfig.port = this._config.port;
		if (this._config.user) poolConfig.user = this._config.user;
		if (this._config.password) poolConfig.password = this._config.password;
		if (this._config.database) poolConfig.database = this._config.database;
		if (this._config.max) poolConfig.max = this._config.max;
		if (this._config.idleTimeoutMillis !== undefined)
			poolConfig.idleTimeoutMillis = this._config.idleTimeoutMillis;
		if (this._config.connectionTimeoutMillis !== undefined)
			poolConfig.connectionTimeoutMillis = this._config.connectionTimeoutMillis;

		// Handle SSL configuration
		if (this._config.ssl !== undefined) {
			if (typeof this._config.ssl === 'boolean') {
				poolConfig.ssl = this._config.ssl;
			} else {
				poolConfig.ssl = this._config.ssl;
			}
		}

		this._pool = new pg.Pool(poolConfig);

		// Handle pool error events for reconnection
		this._pool.on('error', (err: Error) => {
			this._handlePoolError(err);
		});
	}

	/**
	 * Warms the connection by acquiring and releasing a client.
	 * This verifies the pool can connect to the database.
	 */
	private async _warmConnection(): Promise<void> {
		if (this._closed || this._connected) {
			return;
		}

		if (!this._pool) {
			this._initializePool();
		}

		// Acquire a client to verify connectivity
		const client = await this._pool!.connect();
		client.release();

		this._connected = true;
		this._stats.totalConnections++;
		this._stats.lastConnectedAt = new Date();
	}

	/**
	 * Re-initializes the pool for reconnection.
	 */
	private _reinitializePool(): void {
		this._connected = false;
		this._pool = null;
		this._initializePool();
	}

	/**
	 * Handles pool error events.
	 */
	private _handlePoolError(error: Error): void {
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

		// Check if it's a retryable error
		if (!isRetryableError(error)) {
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
				// Close existing pool if any
				if (this._pool) {
					try {
						await this._pool.end();
					} catch {
						// Ignore close errors
					}
					this._pool = null;
				}

				// Attempt to reconnect
				this._reinitializePool();
				await this._warmConnection();

				// Success!
				this._reconnecting = false;
				this._reconnectPromise = null;
				this._config.onreconnected?.();
				return;
			} catch (error) {
				lastError =
					error instanceof Error
						? error
						: new PostgresError({
								message: String(error),
							});
				this._stats.failedReconnects++;
				attempt++;
			}
		}

		// All attempts failed
		this._reconnecting = false;
		this._reconnectPromise = null;

		// Only invoke callback if not explicitly closed/shutdown
		if (!this._closed && !this._shuttingDown) {
			const finalError = new ReconnectFailedError({
				attempts: attempt,
				lastError,
			});

			this._config.onreconnectfailed?.(finalError);
		}
	}

	/**
	 * Ensures the pool is initialized and returns it.
	 */
	private _ensureConnected(): pg.Pool {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Pool has been closed',
			});
		}

		if (!this._pool) {
			throw new ConnectionClosedError({
				message: 'Pool not initialized',
				wasReconnecting: this._reconnecting,
			});
		}

		return this._pool;
	}

	/**
	 * Ensures the pool is connected and returns it.
	 * If reconnection is in progress, waits for it to complete.
	 * If connection hasn't been established yet, warms it first.
	 */
	private async _ensureConnectedAsync(): Promise<pg.Pool> {
		if (this._closed) {
			throw new ConnectionClosedError({
				message: 'Pool has been closed',
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

		if (!this._pool) {
			throw new ConnectionClosedError({
				message: 'Pool not initialized',
				wasReconnecting: false,
			});
		}

		// If not yet connected, warm the connection
		if (!this._connected) {
			await this._warmConnection();
		}

		return this._pool;
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

				if (!this._pool) {
					throw new ConnectionClosedError({
						message: 'Pool not initialized',
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
}

/**
 * Creates a new PostgresPool.
 * This is an alias for `new PostgresPool(config)` for convenience.
 *
 * @param config - Connection configuration
 * @returns A new PostgresPool instance
 */
export function createPool(config?: string | PoolConfig): PostgresPool {
	return new PostgresPool(config);
}

/**
 * Alias for PostgresPool for convenient imports.
 */
export { PostgresPool as Pool };
