import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set. Run `bun run db:push` after configuring it.');
}

export const db = drizzle(neon(process.env.DATABASE_URL), { schema });
export * from './schema';
