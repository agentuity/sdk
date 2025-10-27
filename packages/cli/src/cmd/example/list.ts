import type { SubcommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';

interface ListOptions {
	all: boolean;
	json: boolean;
}

export const listSubcommand: SubcommandDefinition = {
	name: 'list',
	description: 'List all examples',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('list')
			.description('List all examples')
			.option('-a, --all', 'Show all examples', false)
			.option('--json', 'Output as JSON', false)
			.action(async (options: ListOptions) => {
				const { logger } = ctx;

				const examples = ['example-1', 'example-2', 'example-3'];

				if (options.json) {
					console.log(JSON.stringify(examples, null, 2));
				} else {
					logger.info('Listing examples...');
					examples.forEach((ex) => logger.info(`- ${ex}`));
				}
			});
	},
};
