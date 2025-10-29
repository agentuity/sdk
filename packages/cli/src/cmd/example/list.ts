import { createSubcommand } from '../../types';
import { z } from 'zod';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List examples',
	schema: {
		options: z.object({
			all: z.boolean().optional().describe('Show all examples'),
			json: z.boolean().optional().describe('Output as JSON'),
		}),
	},

	async handler(ctx) {
		const { logger, opts } = ctx;

		logger.trace('Starting list command...');
		logger.debug(`All: ${opts.all || false}`);
		logger.debug(`JSON: ${opts.json || false}`);

		const examples = ['example1', 'example2', 'example3'];

		if (opts.json) {
			console.log(JSON.stringify(examples));
		} else {
			logger.info('Examples:');
			for (const example of examples) {
				logger.info(`  - ${example}`);
			}
		}
	},
});
