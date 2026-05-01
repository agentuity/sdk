import { createAuth } from '@agentuity/auth';
import * as authSchema from '@agentuity/auth/schema';
import { drizzleAdapter } from '@agentuity/drizzle';
import { db } from './db';

export const auth = createAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: authSchema,
	}),
});

export type Auth = typeof auth;
