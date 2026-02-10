/**
 * @agentuity/drizzle/schema - Node-compatible schema definitions
 *
 * This entry point re-exports only the Drizzle ORM schema utilities
 * (table definitions, column types, operators) without any Bun-specific
 * dependencies. Use this import path in your schema files so that
 * drizzle-kit (which runs under Node) can resolve them.
 *
 * @example
 * ```typescript
 * // schema.ts — works with both Bun runtime AND drizzle-kit (Node)
 * import { pgTable, text, serial, timestamp } from '@agentuity/drizzle/schema';
 *
 * export const users = pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   name: text('name').notNull(),
 *   email: text('email').notNull().unique(),
 *   createdAt: timestamp('created_at').defaultNow(),
 * });
 * ```
 *
 * @packageDocumentation
 */

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
