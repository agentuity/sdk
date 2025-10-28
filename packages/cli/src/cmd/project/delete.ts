import { createSubcommand } from '@/types';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete a project',
	aliases: ['rm', 'del'],
	requiresAuth: true,

	async handler(ctx) {
		const { logger } = ctx;
		logger.info('TODO: Implement project delete functionality');
	},
});
