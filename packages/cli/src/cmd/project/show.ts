import { createSubcommand } from '@/types';

export const showSubcommand = createSubcommand({
	name: 'show',
	description: 'Show project details',
	requiresAuth: true,

	async handler(ctx) {
		const { logger } = ctx;
		logger.info('TODO: Implement project show functionality');
	},
});
