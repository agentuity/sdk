import { createSubcommand } from '@/types';
import { z } from 'zod';

export const createUserSubcommand = createSubcommand({
	name: 'create-user',
	description: 'Example: Create a user with validation (requires authentication)',
	requiresAuth: true,
	schema: {
		args: z.object({
			username: z.string().min(3).max(20).describe('Username for the new user'),
		}),
		options: z.object({
			email: z.string().email().optional().describe('Email address'),
			admin: z.boolean().optional().describe('Grant admin privileges'),
			age: z.number().int().positive().optional().describe('User age'),
		}),
	},

	async handler(ctx) {
		// ctx.args and ctx.opts are fully typed - NO CASTING NEEDED!
		const { logger, auth, args, opts } = ctx;

		logger.info(`Creating user: ${args.username}`);
		logger.debug(`Authenticated as: ${auth.userId}`);

		if (opts.email) {
			logger.info(`Email: ${opts.email}`);
		}
		if (opts.admin) {
			logger.info('Admin privileges: enabled');
		}
		if (opts.age) {
			logger.info(`Age: ${opts.age}`);
		}

		logger.info('User created successfully!');
	},
});
