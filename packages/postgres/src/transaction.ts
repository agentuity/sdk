import type { SQL, SQLQuery } from 'bun';
import { TransactionError } from './errors';

/**
 * Represents a PostgreSQL transaction with support for savepoints.
 *
 * Transactions are created via `PostgresClient.begin()` and support
 * tagged template literal syntax for queries.
 */
export class Transaction {
	private _sql: SQL;
	private _connection: SQLQuery;
	private _committed = false;
	private _rolledBack = false;
	private _savepointCounter = 0;

	constructor(sql: SQL, connection: SQLQuery) {
		this._sql = sql;
		this._connection = connection;
	}

	/**
	 * Whether the transaction has been committed.
	 */
	get committed(): boolean {
		return this._committed;
	}

	/**
	 * Whether the transaction has been rolled back.
	 */
	get rolledBack(): boolean {
		return this._rolledBack;
	}

	/**
	 * Whether the transaction is still active (not committed or rolled back).
	 */
	get active(): boolean {
		return !this._committed && !this._rolledBack;
	}

	/**
	 * Execute a query within this transaction using tagged template literal syntax.
	 *
	 * @example
	 * ```typescript
	 * const tx = await client.begin();
	 * const result = await tx`SELECT * FROM users WHERE id = ${userId}`;
	 * await tx.commit();
	 * ```
	 */
	query(strings: TemplateStringsArray, ...values: unknown[]): SQLQuery {
		this._ensureActive('query');
		return this._sql(strings, ...values);
	}

	/**
	 * Create a savepoint within this transaction.
	 *
	 * @param name - Optional name for the savepoint. If not provided, a unique name is generated.
	 *               If provided, must be a valid SQL identifier (alphanumeric and underscores only,
	 *               starting with a letter or underscore).
	 * @returns A Savepoint object that can be used to rollback to this point.
	 * @throws {TransactionError} If the provided name is not a valid SQL identifier.
	 *
	 * @example
	 * ```typescript
	 * const tx = await client.begin();
	 * await tx`INSERT INTO users (name) VALUES ('Alice')`;
	 *
	 * const sp = await tx.savepoint();
	 * await tx`INSERT INTO users (name) VALUES ('Bob')`;
	 *
	 * // Oops, rollback Bob but keep Alice
	 * await sp.rollback();
	 *
	 * await tx.commit(); // Only Alice is committed
	 * ```
	 */
	async savepoint(name?: string): Promise<Savepoint> {
		this._ensureActive('savepoint');

		const savepointName = name ?? `sp_${++this._savepointCounter}`;

		// Validate savepoint name to prevent SQL injection
		// Must be a valid SQL identifier: starts with letter or underscore, contains only alphanumeric and underscores
		const validIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
		if (!validIdentifierPattern.test(savepointName)) {
			throw new TransactionError({
				message: `Invalid savepoint name "${savepointName}": must be a valid SQL identifier (alphanumeric and underscores only, starting with a letter or underscore)`,
				phase: 'savepoint',
			});
		}

		try {
			await this._sql`SAVEPOINT ${this._sql.unsafe(savepointName)}`;
			return new Savepoint(this._sql, savepointName);
		} catch (error) {
			throw new TransactionError({
				message: `Failed to create savepoint: ${error instanceof Error ? error.message : String(error)}`,
				phase: 'savepoint',
				cause: error,
			});
		}
	}

	/**
	 * Commit the transaction.
	 *
	 * @throws {TransactionError} If the transaction is not active or commit fails.
	 */
	async commit(): Promise<void> {
		this._ensureActive('commit');

		try {
			await this._sql`COMMIT`;
			this._committed = true;
		} catch (error) {
			throw new TransactionError({
				message: `Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`,
				phase: 'commit',
				cause: error,
			});
		} finally {
			this._releaseConnection();
		}
	}

	/**
	 * Rollback the transaction.
	 *
	 * @throws {TransactionError} If the transaction is not active or rollback fails.
	 */
	async rollback(): Promise<void> {
		this._ensureActive('rollback');

		try {
			await this._sql`ROLLBACK`;
			this._rolledBack = true;
		} catch (error) {
			throw new TransactionError({
				message: `Failed to rollback transaction: ${error instanceof Error ? error.message : String(error)}`,
				phase: 'rollback',
				cause: error,
			});
		} finally {
			this._releaseConnection();
		}
	}

	/**
	 * Releases the underlying reserved connection back to the pool.
	 * Called automatically on commit or rollback. Safe to call multiple times.
	 */
	private _releaseConnection(): void {
		const sql = this._sql as unknown as { release?: () => void };
		if (typeof sql.release === 'function') {
			sql.release();
		}
	}

	/**
	 * Ensures the transaction is still active.
	 */
	private _ensureActive(operation: string): void {
		if (this._committed) {
			throw new TransactionError({
				message: `Cannot ${operation}: transaction has been committed`,
				phase: operation as 'begin' | 'commit' | 'rollback' | 'savepoint',
			});
		}
		if (this._rolledBack) {
			throw new TransactionError({
				message: `Cannot ${operation}: transaction has been rolled back`,
				phase: operation as 'begin' | 'commit' | 'rollback' | 'savepoint',
			});
		}
	}
}

/**
 * Represents a savepoint within a transaction.
 */
export class Savepoint {
	private _sql: SQL;
	private _name: string;
	private _released = false;
	private _rolledBack = false;

	constructor(sql: SQL, name: string) {
		this._sql = sql;
		this._name = name;
	}

	/**
	 * The name of this savepoint.
	 */
	get name(): string {
		return this._name;
	}

	/**
	 * Whether the savepoint has been released.
	 */
	get released(): boolean {
		return this._released;
	}

	/**
	 * Whether the savepoint has been rolled back to.
	 */
	get rolledBack(): boolean {
		return this._rolledBack;
	}

	/**
	 * Rollback to this savepoint.
	 * All changes made after this savepoint was created will be undone.
	 *
	 * @throws {TransactionError} If the savepoint has been released or already rolled back.
	 */
	async rollback(): Promise<void> {
		if (this._released) {
			throw new TransactionError({
				message: `Cannot rollback: savepoint "${this._name}" has been released`,
				phase: 'savepoint',
			});
		}

		if (this._rolledBack) {
			throw new TransactionError({
				message: `Cannot rollback: savepoint "${this._name}" has already been rolled back`,
				phase: 'savepoint',
			});
		}

		try {
			await this._sql`ROLLBACK TO SAVEPOINT ${this._sql.unsafe(this._name)}`;
			this._rolledBack = true;
		} catch (error) {
			throw new TransactionError({
				message: `Failed to rollback to savepoint: ${error instanceof Error ? error.message : String(error)}`,
				phase: 'savepoint',
				cause: error,
			});
		}
	}

	/**
	 * Release this savepoint.
	 * The savepoint is destroyed but changes are kept.
	 */
	async release(): Promise<void> {
		if (this._released) {
			return; // Already released, no-op
		}

		try {
			await this._sql`RELEASE SAVEPOINT ${this._sql.unsafe(this._name)}`;
			this._released = true;
		} catch (error) {
			throw new TransactionError({
				message: `Failed to release savepoint: ${error instanceof Error ? error.message : String(error)}`,
				phase: 'savepoint',
				cause: error,
			});
		}
	}
}

/**
 * Represents a reserved (exclusive) connection from the pool.
 *
 * Reserved connections are created via `PostgresClient.reserve()` and support
 * tagged template literal syntax for queries.
 */
export class ReservedConnection {
	private _sql: SQL;
	private _released = false;

	constructor(sql: SQL) {
		this._sql = sql;
	}

	/**
	 * Whether the connection has been released back to the pool.
	 */
	get released(): boolean {
		return this._released;
	}

	/**
	 * Execute a query on this reserved connection using tagged template literal syntax.
	 *
	 * @example
	 * ```typescript
	 * const conn = await client.reserve();
	 * try {
	 *   await conn`SET LOCAL timezone = 'UTC'`;
	 *   const result = await conn`SELECT NOW()`;
	 * } finally {
	 *   conn.release();
	 * }
	 * ```
	 */
	query(strings: TemplateStringsArray, ...values: unknown[]): SQLQuery {
		if (this._released) {
			throw new TransactionError({
				message: 'Cannot query: connection has been released',
			});
		}
		return this._sql(strings, ...values);
	}

	/**
	 * Release the connection back to the pool.
	 */
	release(): void {
		if (this._released) {
			return; // Already released, no-op
		}
		this._released = true;
		// The underlying SQL connection will be returned to the pool
		// when it goes out of scope or is explicitly closed
	}
}
