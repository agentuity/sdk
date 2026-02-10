/**
 * @agentuity/drizzle - Drizzle ORM integration with resilient PostgreSQL connections
 *
 * This package provides a seamless integration between Drizzle ORM and
 * @agentuity/postgres, combining type-safe database queries with automatic
 * reconnection capabilities.
 *
 * @example
 * ```typescript
 * import { createPostgresDrizzle, pgTable, text, serial } from '@agentuity/drizzle';
 *
 * // Define your schema
 * const users = pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   name: text('name').notNull(),
 *   email: text('email').notNull().unique(),
 * });
 *
 * // Create the database instance
 * const { db, close } = createPostgresDrizzle({
 *   schema: { users },
 * });
 *
 * // Execute type-safe queries
 * const allUsers = await db.select().from(users);
 *
 * // Clean up when done
 * await close();
 * ```
 *
 * @packageDocumentation
 */

// Main factory function
export { createPostgresDrizzle } from './postgres';

// Types
export type { PostgresDrizzleConfig, PostgresDrizzle } from './types';

// Re-export from @agentuity/postgres for convenience
export {
	postgres,
	PostgresClient,
	type CallablePostgresClient,
	type PostgresConfig,
	type ReconnectConfig,
	type ConnectionStats,
	type TLSConfig,
	type TransactionOptions,
	type ReserveOptions,
} from '@agentuity/postgres';

// Re-export common Drizzle utilities for convenience
export {
	sql,
	eq,
	and,
	or,
	not,
	desc,
	asc,
	gt,
	gte,
	lt,
	lte,
	ne,
	isNull,
	isNotNull,
	inArray,
	notInArray,
	between,
	like,
	ilike,
	relations,
} from 'drizzle-orm';

// Re-export pg-core table and column definitions
export {
	pgTable,
	pgSchema,
	pgEnum,
	pgView,
	// Column types
	bigint,
	bigserial,
	boolean,
	vector,
	char,
	cidr,
	customType,
	date,
	doublePrecision,
	inet,
	integer,
	interval,
	json,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	// Constraints and indexes
	primaryKey,
	foreignKey,
	unique,
	uniqueIndex,
	index,
	check,
} from 'drizzle-orm/pg-core';

// Re-export better-auth drizzle adapter for use with @agentuity/auth
export { drizzleAdapter } from 'better-auth/adapters/drizzle';
