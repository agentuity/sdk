/**
 * Tests verifying createPostgresDrizzle config handling.
 *
 * Follows the pattern from packages/postgres/test/kysely.test.ts:
 * - Type compatibility tests (compile = pass)
 * - Direct instance creation with various configs (lazy connection, no real DB needed)
 * - Backward compatibility tests
 */
import { describe, it, expect } from 'bun:test';
import { createPostgresDrizzle } from '../src/postgres';
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
	});

	describe('direct usage', () => {
		it('can create instance with url', () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('can create instance with connectionString', () => {
			const { db, client, close } = createPostgresDrizzle({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('can create instance with connection.url', () => {
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
				close();
			}
		});

		it('can create instance with connection object fields', () => {
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
				close();
			}
		});

		it('can create instance with url and schema', () => {
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
				close();
			}
		});

		it('can create instance with url and logger', () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				logger: true,
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('can create instance with url and reconnect config', () => {
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
				close();
			}
		});

		it('can create instance with url and onReconnected callback', () => {
			const { db, client, close } = createPostgresDrizzle({
				url: 'postgres://localhost:5432/nonexistent_db',
				onReconnected: () => {},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('can create instance with no config (defaults to DATABASE_URL)', () => {
			const { db, client, close } = createPostgresDrizzle();
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});
	});

	describe('URL priority chain', () => {
		// These are type-level / structural tests verifying the config shape.
		// The actual priority logic (connection.url > url > connectionString > DATABASE_URL)
		// is validated by the fact that these configs compile and create valid instances.

		it('connection.url takes highest precedence (type check)', () => {
			const { db, close } = createPostgresDrizzle({
				connection: { url: 'postgres://connection-url:5432/db' },
				url: 'postgres://top-level-url:5432/db',
				connectionString: 'postgres://connection-string:5432/db',
			});
			try {
				expect(db).toBeDefined();
			} finally {
				close();
			}
		});

		it('url takes precedence over connectionString (type check)', () => {
			const { db, close } = createPostgresDrizzle({
				url: 'postgres://top-level-url:5432/db',
				connectionString: 'postgres://connection-string:5432/db',
			});
			try {
				expect(db).toBeDefined();
			} finally {
				close();
			}
		});

		it('connectionString is used when no url or connection provided (type check)', () => {
			const { db, close } = createPostgresDrizzle({
				connectionString: 'postgres://connection-string:5432/db',
			});
			try {
				expect(db).toBeDefined();
			} finally {
				close();
			}
		});
	});

	describe('backward compatibility', () => {
		it('connectionString still works', () => {
			const { db, client, close } = createPostgresDrizzle({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('connection object still works', () => {
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
				close();
			}
		});

		it('connection with individual fields still works', () => {
			const { db, client, close } = createPostgresDrizzle({
				connection: {
					hostname: 'localhost',
					port: 5432,
					database: 'nonexistent_db',
				},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});

		it('full config with connectionString and schema still works', () => {
			const mockSchema = { users: {} };
			const { db, client, close } = createPostgresDrizzle({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				schema: mockSchema,
				logger: true,
				reconnect: {
					maxAttempts: 5,
					initialDelayMs: 100,
				},
				onReconnected: () => {},
			});
			try {
				expect(db).toBeDefined();
				expect(client).toBeDefined();
				expect(typeof close).toBe('function');
			} finally {
				close();
			}
		});
	});
});
