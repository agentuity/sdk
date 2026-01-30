import { describe, test, expect } from 'bun:test';
import type { PostgresDrizzleConfig, PostgresDrizzle } from '../src/types';
import type { ReconnectConfig } from '@agentuity/postgres';

/**
 * Type-level tests for the drizzle types.
 * These tests verify that the TypeScript types are correctly defined
 * and can be used as expected at compile time.
 *
 * Since these are interface types with no runtime behavior,
 * we test that objects conforming to the interfaces are valid.
 */

describe('type definitions', () => {
	describe('PostgresDrizzleConfig', () => {
		test('should accept empty configuration', () => {
			const config: PostgresDrizzleConfig = {};
			expect(config).toEqual({});
		});

		test('should accept connectionString', () => {
			const config: PostgresDrizzleConfig = {
				connectionString: 'postgres://user:pass@localhost:5432/mydb',
			};
			expect(config.connectionString).toBe('postgres://user:pass@localhost:5432/mydb');
		});

		test('should accept connection configuration', () => {
			const config: PostgresDrizzleConfig = {
				connection: {
					hostname: 'localhost',
					port: 5432,
					username: 'user',
					password: 'pass',
					database: 'mydb',
				},
			};
			expect(config.connection?.hostname).toBe('localhost');
			expect(config.connection?.port).toBe(5432);
		});

		test('should accept schema', () => {
			const mockSchema = {
				users: {},
				posts: {},
			};
			const config: PostgresDrizzleConfig<typeof mockSchema> = {
				schema: mockSchema,
			};
			expect(config.schema).toBe(mockSchema);
		});

		test('should accept logger as boolean', () => {
			const config: PostgresDrizzleConfig = {
				logger: true,
			};
			expect(config.logger).toBe(true);
		});

		test('should accept logger as custom logger object', () => {
			const customLogger = {
				logQuery: (query: string, params: unknown[]) => {
					console.log(query, params);
				},
			};
			const config: PostgresDrizzleConfig = {
				logger: customLogger,
			};
			expect(config.logger).toBe(customLogger);
		});

		test('should accept reconnect configuration', () => {
			const reconnect: ReconnectConfig = {
				maxAttempts: 5,
				initialDelayMs: 100,
				maxDelayMs: 30000,
				multiplier: 2,
				jitterMs: 1000,
				enabled: true,
			};
			const config: PostgresDrizzleConfig = {
				reconnect,
			};
			expect(config.reconnect?.maxAttempts).toBe(5);
			expect(config.reconnect?.enabled).toBe(true);
		});

		test('should accept onConnect callback', () => {
			const onConnect = () => {
				console.log('Connected');
			};
			const config: PostgresDrizzleConfig = {
				onConnect,
			};
			expect(config.onConnect).toBe(onConnect);
		});

		test('should accept onReconnected callback', () => {
			const onReconnected = () => {
				console.log('Reconnected');
			};
			const config: PostgresDrizzleConfig = {
				onReconnected,
			};
			expect(config.onReconnected).toBe(onReconnected);
		});

		test('should accept full configuration', () => {
			const mockSchema = { users: {} };
			const config: PostgresDrizzleConfig<typeof mockSchema> = {
				connectionString: 'postgres://user:pass@localhost:5432/mydb',
				schema: mockSchema,
				logger: true,
				reconnect: {
					maxAttempts: 5,
					initialDelayMs: 100,
				},
				onConnect: () => {},
				onReconnected: () => {},
			};
			expect(config.connectionString).toBeDefined();
			expect(config.schema).toBeDefined();
			expect(config.logger).toBe(true);
			expect(config.reconnect).toBeDefined();
			expect(config.onConnect).toBeDefined();
			expect(config.onReconnected).toBeDefined();
		});
	});

	describe('PostgresDrizzle', () => {
		test('should define db property', () => {
			// Type-level test: verify the interface shape
			type DbType = PostgresDrizzle['db'];
			// This compiles if the type is correctly defined
			const _typeCheck: DbType extends object ? true : false = true;
			expect(_typeCheck).toBe(true);
		});

		test('should define client property', () => {
			// Type-level test: verify the interface shape
			type ClientType = PostgresDrizzle['client'];
			// This compiles if the type is correctly defined
			const _typeCheck: ClientType extends object ? true : false = true;
			expect(_typeCheck).toBe(true);
		});

		test('should define close method', () => {
			// Type-level test: verify the interface shape
			type CloseType = PostgresDrizzle['close'];
			// This compiles if the type is correctly defined
			const _typeCheck: CloseType extends () => Promise<void> ? true : false = true;
			expect(_typeCheck).toBe(true);
		});

		test('should support generic schema type', () => {
			// Type-level test: verify generic schema support
			type SchemaType = { users: object; posts: object };
			type TypedDrizzle = PostgresDrizzle<SchemaType>;
			// This compiles if the generic type is correctly defined
			// TypedDrizzle should have db, client, and close properties
			type HasDb = TypedDrizzle['db'];
			type HasClient = TypedDrizzle['client'];
			type HasClose = TypedDrizzle['close'];
			const _typeCheck: HasDb extends object ? true : false = true;
			const _typeCheck2: HasClient extends object ? true : false = true;
			const _typeCheck3: HasClose extends () => Promise<void> ? true : false = true;
			expect(_typeCheck).toBe(true);
			expect(_typeCheck2).toBe(true);
			expect(_typeCheck3).toBe(true);
		});
	});
});
