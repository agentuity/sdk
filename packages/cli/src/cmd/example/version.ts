import type { SubcommandDefinition } from '@/types';

export const versionSubcommand: SubcommandDefinition = {
	name: 'version',
	description: 'Example: Display version information (no auth required)',

	async handler(ctx) {
		// ctx is CommandContext<false> - no auth property!
		const { logger } = ctx;

		// TypeScript prevents: const { auth } = ctx; ❌

		logger.info('Version 1.0.0');
		logger.info('This command does not require authentication');
	},
};
