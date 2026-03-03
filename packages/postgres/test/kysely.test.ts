/**
 * Tests verifying that PostgresPool is compatible with Kysely's PostgresDialect.
 *
 * These are primarily type-level tests to ensure PostgresPool can be used directly
 * with Kysely without needing to access the `.raw` property.
 */
import { describe, it, expect } from 'bun:test';
import { Kysely, PostgresDialect, Generated, Selectable } from 'kysely';
import type { PostgresPool as KyselyPostgresPool } from 'kysely';
import { PostgresPool, Pool } from '../src/pool';

// Example database schema for type testing
interface Database {
	users: UsersTable;
}

interface UsersTable {
	id: Generated<number>;
	name: string;
	email: string;
	created_at: Generated<Date>;
}

type User = Selectable<UsersTable>;

describe('Kysely PostgresDialect compatibility', () => {
	describe('type compatibility', () => {
		it('PostgresPool satisfies Kysely PostgresPool interface', () => {
			// This is a type-level test: if it compiles, the types are compatible
			// We use a function to avoid runtime execution
			const _typeCheck = (): void => {
				const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });

				// Verify connect() returns compatible type
				const connectResult: ReturnType<KyselyPostgresPool['connect']> = pool.connect();

				// Verify end() returns compatible type
				const endResult: ReturnType<KyselyPostgresPool['end']> = pool.end();

				// Suppress unused variable warnings
				void connectResult;
				void endResult;
			};

			// The test passes if it compiles
			expect(typeof _typeCheck).toBe('function');
		});

		it('PostgresPool can be assigned to Kysely PostgresPool type', () => {
			// This is a type-level test using type assertion
			const _typeCheck = (): void => {
				const pool = new PostgresPool({ connectionString: 'postgres://localhost/test' });

				// This assignment would fail at compile time if types are incompatible
				const kyselyPool: KyselyPostgresPool = pool;

				// Suppress unused variable warning
				void kyselyPool;
			};

			expect(typeof _typeCheck).toBe('function');
		});

		it('Pool alias also satisfies Kysely PostgresPool interface', () => {
			const _typeCheck = (): void => {
				const pool = new Pool({ connectionString: 'postgres://localhost/test' });

				// This assignment would fail at compile time if types are incompatible
				const kyselyPool: KyselyPostgresPool = pool;

				// Suppress unused variable warning
				void kyselyPool;
			};

			expect(typeof _typeCheck).toBe('function');
		});
	});

	describe('direct Kysely usage', () => {
		it('can create Kysely instance with PostgresPool directly (no .raw)', () => {
			// Create a pool (won't actually connect)
			const pool = new PostgresPool({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				// Disable preconnect to avoid actual connection attempt
				preconnect: false,
			});

			// Create Kysely instance with pool directly - no .raw needed
			const db = new Kysely<Database>({
				dialect: new PostgresDialect({
					pool, // Direct usage, not pool.raw
				}),
			});

			// Verify Kysely instance was created successfully
			expect(db).toBeInstanceOf(Kysely);

			// Verify we can build queries (type-level verification)
			const query = db.selectFrom('users').select(['id', 'name', 'email']);
			expect(query).toBeDefined();

			// Clean up
			pool.end();
		});

		it('can create Kysely instance with Pool alias directly', () => {
			const pool = new Pool({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				preconnect: false,
			});

			// Create Kysely instance with Pool alias directly
			const db = new Kysely<Database>({
				dialect: new PostgresDialect({ pool }),
			});

			expect(db).toBeInstanceOf(Kysely);
			pool.end();
		});

		it('can create Kysely instance with pool factory function', async () => {
			// Kysely also accepts a factory function
			const db = new Kysely<Database>({
				dialect: new PostgresDialect({
					pool: async () => {
						return new PostgresPool({
							connectionString: 'postgres://localhost:5432/nonexistent_db',
							preconnect: false,
						});
					},
				}),
			});

			try {
				expect(db).toBeInstanceOf(Kysely);
			} finally {
				await db.destroy();
			}
		});
	});

	describe('backward compatibility', () => {
		it('.raw property still works for direct pg.Pool access', () => {
			const pool = new PostgresPool({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				preconnect: false,
			});

			// The .raw property should still be available for backward compatibility
			expect(() => {
				const raw = pool.raw;
				void raw;
			}).not.toThrow();

			pool.end();
		});

		it('can use .raw with PostgresDialect (legacy pattern)', () => {
			const pool = new PostgresPool({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				preconnect: false,
			});

			// Legacy pattern: using .raw
			const db = new Kysely<Database>({
				dialect: new PostgresDialect({
					pool: pool.raw,
				}),
			});

			expect(db).toBeInstanceOf(Kysely);
			pool.end();
		});
	});

	describe('query builder type safety', () => {
		it('produces correctly typed query results', () => {
			// Type-level test to verify query results are properly typed
			const _typeCheck = async (db: Kysely<Database>): Promise<void> => {
				// Select query should return User[]
				const users: User[] = await db.selectFrom('users').selectAll().execute();

				// Individual fields should be properly typed
				const user = users[0];
				if (user) {
					const _id: number = user.id;
					const _name: string = user.name;
					const _email: string = user.email;
					const _createdAt: Date = user.created_at;
					void _id;
					void _name;
					void _email;
					void _createdAt;
				}

				void users;
			};

			expect(typeof _typeCheck).toBe('function');
		});

		it('query builder methods are available', () => {
			const pool = new PostgresPool({
				connectionString: 'postgres://localhost:5432/nonexistent_db',
				preconnect: false,
			});

			const db = new Kysely<Database>({
				dialect: new PostgresDialect({ pool }),
			});

			// Verify common query builder methods are available (type check)
			expect(typeof db.selectFrom).toBe('function');
			expect(typeof db.insertInto).toBe('function');
			expect(typeof db.updateTable).toBe('function');
			expect(typeof db.deleteFrom).toBe('function');
			expect(typeof db.transaction).toBe('function');

			pool.end();
		});
	});
});
