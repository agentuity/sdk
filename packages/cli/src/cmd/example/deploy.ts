import { createSubcommand } from '../../types';
import { z } from 'zod';

export const deploySubcommand = createSubcommand({
	name: 'deploy',
	description: 'Example: Deploy to an environment (requires authentication)',
	requiresAuth: true,
	schema: {
		args: z.object({
			environment: z.string().describe('Target environment (dev/staging/prod)'),
		}),
		options: z.object({
			force: z.boolean().optional().describe('Force deployment without confirmation'),
			dryRun: z.boolean().optional().describe('Preview changes without deploying'),
		}),
	},

	async handler(ctx) {
		// ctx.args and ctx.opts are fully typed - NO CASTING NEEDED!
		const { logger, auth, args, opts } = ctx;

		logger.info(`Deploying to: ${args.environment}`);
		logger.debug(`Using API key: ${auth.apiKey.substring(0, 8)}...`);

		if (opts.dryRun) {
			logger.info('Dry run mode - no changes made');
			return;
		}

		if (opts.force) {
			logger.info('Force deployment enabled');
		}

		logger.info('Deployment complete');
	},
});
