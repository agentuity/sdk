import { describe, test, expect } from 'bun:test';

/**
 * Tests that all expected exports from @agentuity/drizzle are available.
 * These tests verify the public API surface of the package.
 */

describe('exports', () => {
	describe('main factory function', () => {
		test('createPostgresDrizzle is exported and is a function', async () => {
			const { createPostgresDrizzle } = await import('../src/index');
			expect(createPostgresDrizzle).toBeDefined();
			expect(typeof createPostgresDrizzle).toBe('function');
		});

		test('drizzle is exported and is a function', async () => {
			const { drizzle } = await import('../src/index');
			expect(drizzle).toBeDefined();
			expect(typeof drizzle).toBe('function');
		});
	});

	describe('re-exports from @agentuity/postgres', () => {
		test('postgres is exported and is a function', async () => {
			const { postgres } = await import('../src/index');
			expect(postgres).toBeDefined();
			expect(typeof postgres).toBe('function');
		});

		test('PostgresClient is exported', async () => {
			const { PostgresClient } = await import('../src/index');
			expect(PostgresClient).toBeDefined();
			expect(typeof PostgresClient).toBe('function');
		});
	});

	describe('re-exports from drizzle-orm', () => {
		test('sql is exported', async () => {
			const { sql } = await import('../src/index');
			expect(sql).toBeDefined();
		});

		test('comparison operators are exported', async () => {
			const { eq, and, or, not, gt, gte, lt, lte, ne } = await import('../src/index');
			expect(eq).toBeDefined();
			expect(typeof eq).toBe('function');
			expect(and).toBeDefined();
			expect(typeof and).toBe('function');
			expect(or).toBeDefined();
			expect(typeof or).toBe('function');
			expect(not).toBeDefined();
			expect(typeof not).toBe('function');
			expect(gt).toBeDefined();
			expect(typeof gt).toBe('function');
			expect(gte).toBeDefined();
			expect(typeof gte).toBe('function');
			expect(lt).toBeDefined();
			expect(typeof lt).toBe('function');
			expect(lte).toBeDefined();
			expect(typeof lte).toBe('function');
			expect(ne).toBeDefined();
			expect(typeof ne).toBe('function');
		});

		test('ordering operators are exported', async () => {
			const { desc, asc } = await import('../src/index');
			expect(desc).toBeDefined();
			expect(typeof desc).toBe('function');
			expect(asc).toBeDefined();
			expect(typeof asc).toBe('function');
		});

		test('null check operators are exported', async () => {
			const { isNull, isNotNull } = await import('../src/index');
			expect(isNull).toBeDefined();
			expect(typeof isNull).toBe('function');
			expect(isNotNull).toBeDefined();
			expect(typeof isNotNull).toBe('function');
		});

		test('array operators are exported', async () => {
			const { inArray, notInArray } = await import('../src/index');
			expect(inArray).toBeDefined();
			expect(typeof inArray).toBe('function');
			expect(notInArray).toBeDefined();
			expect(typeof notInArray).toBe('function');
		});

		test('range and pattern operators are exported', async () => {
			const { between, like, ilike } = await import('../src/index');
			expect(between).toBeDefined();
			expect(typeof between).toBe('function');
			expect(like).toBeDefined();
			expect(typeof like).toBe('function');
			expect(ilike).toBeDefined();
			expect(typeof ilike).toBe('function');
		});
	});

	describe('re-exports from drizzle-orm/pg-core', () => {
		test('pgTable is exported', async () => {
			const { pgTable } = await import('../src/index');
			expect(pgTable).toBeDefined();
			expect(typeof pgTable).toBe('function');
		});

		test('pgSchema is exported', async () => {
			const { pgSchema } = await import('../src/index');
			expect(pgSchema).toBeDefined();
			expect(typeof pgSchema).toBe('function');
		});

		test('pgEnum is exported', async () => {
			const { pgEnum } = await import('../src/index');
			expect(pgEnum).toBeDefined();
			expect(typeof pgEnum).toBe('function');
		});

		test('column types are exported', async () => {
			const {
				bigint,
				bigserial,
				boolean,
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
			} = await import('../src/index');

			expect(bigint).toBeDefined();
			expect(bigserial).toBeDefined();
			expect(boolean).toBeDefined();
			expect(char).toBeDefined();
			expect(cidr).toBeDefined();
			expect(customType).toBeDefined();
			expect(date).toBeDefined();
			expect(doublePrecision).toBeDefined();
			expect(inet).toBeDefined();
			expect(integer).toBeDefined();
			expect(interval).toBeDefined();
			expect(json).toBeDefined();
			expect(jsonb).toBeDefined();
			expect(macaddr).toBeDefined();
			expect(macaddr8).toBeDefined();
			expect(numeric).toBeDefined();
			expect(real).toBeDefined();
			expect(serial).toBeDefined();
			expect(smallint).toBeDefined();
			expect(smallserial).toBeDefined();
			expect(text).toBeDefined();
			expect(time).toBeDefined();
			expect(timestamp).toBeDefined();
			expect(uuid).toBeDefined();
			expect(varchar).toBeDefined();
		});

		test('constraints and indexes are exported', async () => {
			const { primaryKey, foreignKey, unique, uniqueIndex, index, check } = await import(
				'../src/index'
			);

			expect(primaryKey).toBeDefined();
			expect(typeof primaryKey).toBe('function');
			expect(foreignKey).toBeDefined();
			expect(typeof foreignKey).toBe('function');
			expect(unique).toBeDefined();
			expect(typeof unique).toBe('function');
			expect(uniqueIndex).toBeDefined();
			expect(typeof uniqueIndex).toBe('function');
			expect(index).toBeDefined();
			expect(typeof index).toBe('function');
			expect(check).toBeDefined();
			expect(typeof check).toBe('function');
		});
	});

	describe('re-exports from drizzle-orm/bun-sql (type-only)', () => {
		// BunSQLDatabase, BunSQLSession, BunSQLTransaction, and BunSQLPreparedQuery
		// are now type-only exports to avoid circular dependency issues when bundled.
		// Type-only exports are erased at runtime, so we verify they exist in the
		// TypeScript source via a simple module import (no runtime value check).
		test('module imports successfully (types are available at compile time)', async () => {
			const mod = await import('../src/index');
			// The module should load without circular dependency errors.
			// BunSQL types are type-only exports and won't appear as runtime values.
			expect(mod).toBeDefined();
		});
	});
});
