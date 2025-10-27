import { createSubcommand } from '@/types';
import { z } from 'zod';

export const createCommand = createSubcommand({
	name: 'create',
	description: 'Create a new example',
	schema: {
		args: z.object({
			name: z.string().describe('Name of the example'),
		}),
		options: z.object({
			type: z.string().optional().describe('Example type'),
			force: z.boolean().optional().describe('Force creation'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts } = ctx;

		logger.trace('Starting create command...');
		logger.debug(`Type: ${opts.type || 'default'}`);
		logger.debug(`Force: ${opts.force || false}`);
		logger.info(`Creating example: ${args.name}`);

		if (opts.force) {
			logger.warn('Force mode enabled');
		}

		logger.info('Example created successfully!');
	},
});
