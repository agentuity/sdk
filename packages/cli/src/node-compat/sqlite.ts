/**
 * Synchronous SQLite shim.
 *
 * Both Bun and Node 24+ ship a built-in synchronous SQLite binding,
 * but they live at different module specifiers and expose slightly
 * different constructor names:
 *
 *   - **Bun**:  `import { Database } from 'bun:sqlite'`
 *   - **Node 24+**: `import { DatabaseSync } from 'node:sqlite'`
 *     (marked experimental in 24.x; stable surface)
 *
 * The lowest-common-denominator surface (constructor + `prepare()` +
 * statement-level `.run()` / `.get()` / `.all()` / `.exec()` /
 * `.close()`) behaves identically across both implementations, so
 * call sites that program against this module's `Database` type get a
 * single migration target.
 *
 * Note: this shim is **not** part of the trivial-helpers-to-inline
 * group. It survives Phase 5 cleanup because the per-runtime module
 * specifier and constructor name genuinely differ.
 */

import { runtimeKind } from './runtime-info.ts';

/**
 * Lowest-common-denominator SQLite database handle.
 *
 * Both `bun:sqlite`'s `Database` and `node:sqlite`'s `DatabaseSync`
 * structurally satisfy this interface for the methods we use.
 */
export interface Database {
	/** Prepare a statement for repeated execution. */
	prepare<TParams extends unknown[] = unknown[]>(sql: string): Statement<TParams>;
	/**
	 * Execute one or more SQL statements with no parameters and no
	 * row return. Use for `PRAGMA`, `CREATE TABLE`, `ALTER TABLE`, etc.
	 */
	exec(sql: string): void;
	/** Close the database. */
	close(): void;
}

/** Prepared statement. */
export interface Statement<TParams extends unknown[] = unknown[]> {
	run(...params: TParams): { changes: number | bigint; lastInsertRowid: number | bigint };
	get<T = unknown>(...params: TParams): T | undefined;
	all<T = unknown>(...params: TParams): T[];
	finalize?(): void;
}

/** Options accepted by `openDatabase`. */
export interface OpenDatabaseOptions {
	/**
	 * Open the database in read-only mode. Bun calls this `readonly`,
	 * Node 24+ calls it `readOnly`; the shim translates.
	 */
	readonly?: boolean;
}

/**
 * Open a SQLite database at the given path, or `:memory:` for an
 * in-memory database. Returns a unified `Database` handle backed by
 * whichever runtime is hosting the process.
 *
 * Resolves the underlying SQLite module dynamically, so importing this
 * file does not pin the consumer to either runtime — the choice is
 * made at the first call.
 */
export async function openDatabase(
	filename: string,
	opts?: OpenDatabaseOptions
): Promise<Database> {
	if (runtimeKind() === 'bun') {
		const mod = await import('bun:sqlite');
		const bunOpts = opts?.readonly ? { readonly: true } : undefined;
		// The structural shapes match the Database interface; TS can't see
		// that across the dynamic boundary, so we cast.
		return new mod.Database(filename, bunOpts) as unknown as Database;
	}
	const mod = await import('node:sqlite');
	const nodeOpts = opts?.readonly ? { readOnly: true } : undefined;
	return new mod.DatabaseSync(filename, nodeOpts) as unknown as Database;
}
