import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set. Run `npm run db:push` after configuring it.');
}

export const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
export * from './schema';
