import { createPostgresDrizzle, type PostgresDrizzlePg } from '@agentuity/drizzle';
import * as schema from './schema';

type Schema = typeof schema;
type Db = PostgresDrizzlePg<Schema>['db'];

/**
 * Build the Drizzle client lazily so the server can boot without DATABASE_URL.
 * The error surfaces only when a route actually tries to query the database.
 */
function buildDb(): Db {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required');
	}
	return createPostgresDrizzle({ connectionString: databaseUrl, schema }).db;
}

let _db: Db | null = null;

/**
 * Single Drizzle client shared by Better Auth's adapter and your app's queries.
 * The schema spans both halves: Better Auth's tables (re-exported from
 * `@agentuity/auth/schema` in `./schema`) plus your own tables.
 */
export const db = new Proxy({} as Db, {
	get(_target, prop, receiver) {
		_db ??= buildDb();
		return Reflect.get(_db, prop, receiver);
	},
});
