import type { PostgresConfig } from './types';
import { createCallableClient, type CallablePostgresClient } from './client';

/**
 * Creates a resilient PostgreSQL client with automatic reconnection.
 *
 * This is the main entry point for creating a PostgreSQL client. The returned
 * client can be used as a tagged template literal for queries.
 *
 * @param config - Connection configuration. Can be:
 *   - A connection URL string (e.g., `postgres://user:pass@host:5432/db`)
 *   - A configuration object with connection options
 *   - Omitted to use `process.env.DATABASE_URL`
 *
 * @returns A callable PostgresClient that supports tagged template literals
 *
 * @example
 * ```typescript
 * import { postgres } from '@agentuity/postgres';
 *
 * // Using environment variable (DATABASE_URL)
 * const sql = postgres();
 *
 * // Using connection URL
 * const sql = postgres('postgres://user:pass@localhost:5432/mydb');
 *
 * // Using configuration object
 * const sql = postgres({
 *   hostname: 'localhost',
 *   port: 5432,
 *   username: 'user',
 *   password: 'pass',
 *   database: 'mydb',
 *   reconnect: {
 *     maxAttempts: 5,
 *     initialDelayMs: 100,
 *   },
 * });
 *
 * // Execute queries using tagged template literals
 * const users = await sql`SELECT * FROM users`;
 * const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
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
 */
export function postgres(config?: string | PostgresConfig): CallablePostgresClient {
	return createCallableClient(config);
}

/**
 * Default export for convenience.
 */
export default postgres;
