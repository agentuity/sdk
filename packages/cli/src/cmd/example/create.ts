import type { SubcommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';

interface CreateOptions {
	type: string;
	force: boolean;
}

export const createSubcommand: SubcommandDefinition = {
	name: 'create',
	description: 'Create a new example',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('create <name>')
			.description('Create a new example')
			.option('-t, --type <type>', 'Example type', 'default')
			.option('-f, --force', 'Force creation', false)
			.action(async (name: string, options: CreateOptions) => {
				const { logger } = ctx;

				logger.trace('Starting create command...');
				logger.debug(`Type: ${options.type}`);
				logger.debug(`Force: ${options.force}`);
				logger.info(`Creating example: ${name}`);

				if (options.force) {
					logger.warn('Force mode enabled');
				}

				logger.info('Example created successfully!');
			});
	},
};
