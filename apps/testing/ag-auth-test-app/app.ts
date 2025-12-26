import { createApp } from '@agentuity/runtime';
import { ensureAuthSchema } from '@agentuity/auth/agentuity/migrations';
import { Pool } from 'pg';

const { server, logger } = await createApp({
	setup: async () => {
		// Ensure auth tables exist (idempotent - safe to call on every startup)
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		const { created } = await ensureAuthSchema({ db: pool });
		if (created) {
			console.log('[Auth] Created auth schema tables');
		}
		await pool.end();
	},
	shutdown: async (_state) => {
		// the state variable will be the same value was what you
		// return from setup above. you can use this callback to
		// close any resources or other shutdown related tasks
	},
});

logger.debug('Running %s', server.url);
