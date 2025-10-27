import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { clearAuth } from '@/config';
import * as tui from '@/tui';

export const logoutCommand: SubcommandDefinition = {
	name: 'logout',
	description: 'Logout of the Agentuity Cloud Platform',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('logout')
			.description('Logout of the Agentuity Cloud Platform')
			.action(async () => {
				const { logger } = ctx;

				try {
					await clearAuth();
					tui.success('You have been logged out');
				} catch (error) {
					if (error instanceof Error) {
						logger.fatal(`Logout failed: ${error.message}`);
					} else {
						logger.fatal('Logout failed');
					}
				}
			});
	},
};

export default logoutCommand;
