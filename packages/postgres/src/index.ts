/**
 * @agentuity/postgres - Resilient PostgreSQL client with automatic reconnection
 *
 * This package provides a PostgreSQL client that wraps Bun's native SQL driver
 * and adds automatic reconnection with exponential backoff.
 *
 * @example
 * ```typescript
 * import { postgres } from '@agentuity/postgres';
 *
 * // Create a client (uses DATABASE_URL by default)
 * const sql = postgres();
 *
 * // Execute queries using tagged template literals
 * const users = await sql`SELECT * FROM users WHERE active = ${true}`;
 *
 * // Transactions
 * const tx = await sql.begin();
 * try {
 *   await tx`INSERT INTO users (name) VALUES (${name})`;
 *   await tx.commit();
 * } catch (error) {
 *   await tx.rollback();
 *   throw error;
 * }
 *
 * // Close when done
 * await sql.close();
 * ```
 *
 * @packageDocumentation
 */

// Main factory function
export { postgres, default } from './postgres';

// Client class for advanced usage
export { PostgresClient, createCallableClient, type CallablePostgresClient } from './client';

// Pool class for pg.Pool-based connections
export { PostgresPool, Pool, createPool } from './pool';

// Transaction and reserved connection classes
export { Transaction, Savepoint, ReservedConnection } from './transaction';

// Patch function for modifying Bun.SQL globally
export { patchBunSQL, isPatched, SQL } from './patch';

// TLS utilities
export { injectSslMode } from './tls';

// Types
export type {
	PostgresConfig,
	ReconnectConfig,
	ConnectionStats,
	TLSConfig,
	TransactionOptions,
	ReserveOptions,
	PoolConfig,
	PoolStats,
	PoolSSLConfig,
} from './types';

// Errors
export {
	PostgresError,
	ConnectionClosedError,
	ReconnectFailedError,
	QueryTimeoutError,
	TransactionError,
	UnsupportedOperationError,
	isRetryableError,
} from './errors';

// Reconnection utilities
export { computeBackoff, sleep, mergeReconnectConfig, DEFAULT_RECONNECT_CONFIG } from './reconnect';

// Global registry for coordinated shutdown
export {
	shutdownAll,
	getClientCount,
	getClients,
	hasActiveClients,
	type Registrable,
} from './registry';
