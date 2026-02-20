/**
 * Tests verifying createPostgresDrizzle config handling.
 *
 * Follows the pattern from packages/postgres/test/kysely.test.ts:
 * - Type compatibility tests (compile = pass)
 * - Direct instance creation with various configs (lazy connection, no real DB needed)
 * - URL priority chain tests (via resolvePostgresClientConfig)
 */
import { describe, it, expect } from 'bun:test';
import { createPostgresDrizzle, resolvePostgresClientConfig } from '../src/postgres';
import type { PostgresDrizzleConfig } from '../src/types';

describe('createPostgresDrizzle config', () => {
	describe('type compatibility', () => {
		it('accepts url at top level', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts url with schema', () => {
			const _typeCheck = (): void => {
				const mockSchema = { users: {} };
				const config: PostgresDrizzleConfig<typeof mockSchema> = {
					url: 'postgres://localhost/test',
					schema: mockSchema,
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts connectionString (backward compat)', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connectionString: 'postgres://localhost/test',
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts connection object with url', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						url: 'postgres://localhost/test',
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts connection object with individual fields', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						hostname: 'localhost',
						port: 5432,
						username: 'user',
						password: 'pass',
						database: 'mydb',
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts full configuration with all options', () => {
			const _typeCheck = (): void => {
				const mockSchema = { users: {} };
				const config: PostgresDrizzleConfig<typeof mockSchema> = {
					url: 'postgres://localhost/test',
					connectionString: 'postgres://localhost/test2',
					connection: {
						url: 'postgres://localhost/test3',
					},
					schema: mockSchema,
					logger: true,
					reconnect: {
						maxAttempts: 5,
						initialDelayMs: 100,
					},
					onConnect: () => {},
					onReconnected: () => {},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts url alongside other options without connection', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
					logger: true,
					reconnect: { maxAttempts: 3 },
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts prepare: false option', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
					prepare: false,
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts prepare: true option', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
					prepare: true,
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts prepare in connection object', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						url: 'postgres://localhost/test',
						prepare: false,
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts bigint option', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
					bigint: true,
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts maxLifetime option', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					url: 'postgres://localhost/test',
					maxLifetime: 3600,
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts connection runtime parameters in connection object', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						url: 'postgres://localhost/test',
						connection: {
							search_path: 'myapp,public',
							statement_timeout: '30s',
						},
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts path in connection object', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						path: '/var/run/postgresql/.s.PGSQL.5432',
						database: 'test',
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts password function in connection object', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						url: 'postgres://localhost/test',
						password: async () => 'token',
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});

		it('accepts onconnect in connection object', () => {
			const _typeCheck = (): void => {
				const config: PostgresDrizzleConfig = {
					connection: {
						url: 'postgres://localhost/test',
						onconnect: () => {},
					},
				};
				void config;
			};
			expect(typeof _typeCheck).toBe('function');
		});
	});

	describe('direct usage', () => {
		it('can create instance with url', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with connectionString', async () => {
			const { db, client, close } = createPostgresDrizzle({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with connection.url', async () => {
			const { db, client, close } = createPostgresDrizzle({
				connection: {
					url: 'postgres://localhost:5432/nonexistent_db',
				},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with connection object fields', async () => {
			const { db, client, close } = createPostgresDrizzle({
				connection: {
					hostname: 'localhost',
					port: 5432,
					database: 'nonexistent_db',
					username: 'user',
					password: 'pass',
				},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with url and schema', async () => {
			const mockSchema = { users: {} };
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				schema: mockSchema,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with url and logger', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				logger: true,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with url and reconnect config', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				reconnect: {
					maxAttempts: 3,
					initialDelayMs: 50,
				},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with url and onReconnected callback', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				onReconnected: () => {},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with prepare: false', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				prepare: false,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with prepare: true', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				prepare: true,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with bigint: true', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				bigint: true,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with maxLifetime', async () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				maxLifetime: 3600,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				await close();
			}
		});

		it('can create instance with no config (defaults to DATABASE_URL)', async () => {
			const originalDatabaseUrl = process.env.DATABASE_URL;
			process.env.DATABASE_URL = 'postgres://localhost:5432/dummy_test_db';
			try {
				const { db, client, close } = createPostgresDrizzle();
				try {
					expect(db).toBeDefined();
					expect(client).toBeDefined();
					expect(typeof close).toBe('function');
				} finally {
					await close();
				}
			} finally {
				if (originalDatabaseUrl === undefined) {
					delete process.env.DATABASE_URL;
				} else {
					process.env.DATABASE_URL = originalDatabaseUrl;
				}
			}
		});
	});

	describe('URL priority chain', () => {
		it('connection.url takes highest precedence', () => {
			const resolved = resolvePostgresClientConfig({
				connection: { url: 'postgres://connection-url:5432/db' },
				url: 'postgres://top-level-url:5432/db',
				connectionString: 'postgres://connection-string:5432/db',
			});
			expect(resolved.url).toBe('postgres://connection-url:5432/db');
		});

		it('url takes precedence over connectionString', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://top-level-url:5432/db',
				connectionString: 'postgres://connection-string:5432/db',
			});
			expect(resolved.url).toBe('postgres://top-level-url:5432/db');
		});

		it('connectionString is used when no url or connection provided', () => {
			const resolved = resolvePostgresClientConfig({
				connectionString: 'postgres://connection-string:5432/db',
			});
			expect(resolved.url).toBe('postgres://connection-string:5432/db');
		});

		it('falls back to DATABASE_URL when no url options provided', () => {
			const originalDatabaseUrl = process.env.DATABASE_URL;
			process.env.DATABASE_URL = 'postgres://env-url:5432/db';
			try {
				const resolved = resolvePostgresClientConfig({});
				expect(resolved.url).toBe('postgres://env-url:5432/db');
			} finally {
				if (originalDatabaseUrl === undefined) {
					delete process.env.DATABASE_URL;
				} else {
					process.env.DATABASE_URL = originalDatabaseUrl;
				}
			}
		});

		it('url takes precedence over DATABASE_URL', () => {
			const originalDatabaseUrl = process.env.DATABASE_URL;
			process.env.DATABASE_URL = 'postgres://env-url:5432/db';
			try {
				const resolved = resolvePostgresClientConfig({
					url: 'postgres://top-level-url:5432/db',
				});
				expect(resolved.url).toBe('postgres://top-level-url:5432/db');
			} finally {
				if (originalDatabaseUrl === undefined) {
					delete process.env.DATABASE_URL;
				} else {
					process.env.DATABASE_URL = originalDatabaseUrl;
				}
			}
		});

		it('forwards reconnect config', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				reconnect: { maxAttempts: 5, initialDelayMs: 100 },
			});
			expect(resolved.reconnect).toEqual({ maxAttempts: 5, initialDelayMs: 100 });
		});

		it('forwards onReconnected as onreconnected', () => {
			const cb = () => {};
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				onReconnected: cb,
			});
			expect(resolved.onreconnected).toBe(cb);
		});

		it('does not mutate the original connection config', () => {
			const connection = { url: 'postgres://original:5432/db' };
			const resolved = resolvePostgresClientConfig({
				connection,
				reconnect: { maxAttempts: 3 },
			});
			expect(resolved.url).toBe('postgres://original:5432/db');
			expect(resolved.reconnect).toEqual({ maxAttempts: 3 });
			// Original object should be unmodified
			expect(connection).toEqual({ url: 'postgres://original:5432/db' });
		});

		it('forwards prepare: false option', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				prepare: false,
			});
			expect(resolved.prepare).toBe(false);
		});

		it('forwards prepare: true option', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				prepare: true,
			});
			expect(resolved.prepare).toBe(true);
		});

		it('does not set prepare when not specified', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
			});
			expect(resolved.prepare).toBeUndefined();
		});

		it('preserves prepare from connection config', () => {
			const resolved = resolvePostgresClientConfig({
				connection: {
					url: 'postgres://localhost/db',
					prepare: true,
				},
			});
			expect(resolved.prepare).toBe(true);
		});

		it('top-level prepare overrides connection prepare', () => {
			const resolved = resolvePostgresClientConfig({
				connection: {
					url: 'postgres://localhost/db',
					prepare: true,
				},
				prepare: false,
			});
			expect(resolved.prepare).toBe(false);
		});

		it('forwards bigint option', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				bigint: true,
			});
			expect(resolved.bigint).toBe(true);
		});

		it('forwards maxLifetime option', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
				maxLifetime: 3600,
			});
			expect(resolved.maxLifetime).toBe(3600);
		});

		it('does not set bigint when not specified', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
			});
			expect(resolved.bigint).toBeUndefined();
		});

		it('does not set maxLifetime when not specified', () => {
			const resolved = resolvePostgresClientConfig({
				url: 'postgres://localhost/db',
			});
			expect(resolved.maxLifetime).toBeUndefined();
		});

		it('preserves connection runtime parameters from connection config', () => {
			const resolved = resolvePostgresClientConfig({
				connection: {
					url: 'postgres://localhost/db',
					connection: {
						search_path: 'myapp',
						application_name: 'test',
					},
				},
			});
			expect(resolved.connection).toEqual({
				search_path: 'myapp',
				application_name: 'test',
			});
		});

		it('preserves path from connection config', () => {
			const resolved = resolvePostgresClientConfig({
				connection: {
					path: '/tmp/.s.PGSQL.5432',
					database: 'test',
				},
			});
			expect(resolved.path).toBe('/tmp/.s.PGSQL.5432');
		});

		it('preserves password function from connection config', () => {
			const passwordFn = async () => 'token';
			const resolved = resolvePostgresClientConfig({
				connection: {
					url: 'postgres://localhost/db',
					password: passwordFn,
				},
			});
			expect(resolved.password).toBe(passwordFn);
		});
	});
});
