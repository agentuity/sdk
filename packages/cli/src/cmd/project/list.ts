import { createSubcommand } from '@/types';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List all projects',
	aliases: ['ls'],
	requiresAuth: true,

	async handler(ctx) {
		const { logger } = ctx;
		logger.info('TODO: Implement project list functionality');
	},
});
