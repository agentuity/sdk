import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let db: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set. Run `npm run db:push` after configuring it.');
	}

	db ??= drizzle(new Pool({ connectionString: databaseUrl }), { schema });
	return db;
}

export * from './schema';
