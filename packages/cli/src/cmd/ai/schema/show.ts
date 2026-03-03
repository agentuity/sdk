import { createSubcommand, type CommandContext } from '../../../types';
import { ErrorCode } from '../../../errors';
import { getCommand } from '../../../command-prefix';

export const showSubcommand = createSubcommand({
	name: 'show',
	description: 'Display the complete CLI schema',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('schema show'), description: 'Show details' },
		{ command: getCommand('--json schema show'), description: 'Show output in JSON format' },
	],
	async handler(ctx: CommandContext) {
		const { logger } = ctx;

		// Access the schema stored in the global context
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const schema = (global as any).__CLI_SCHEMA__;

		if (!schema) {
			logger.fatal('Schema not available. This is a CLI bug.', ErrorCode.INTERNAL_ERROR);
		}

		// Always output JSON (this command is primarily for machine consumption)
		console.log(JSON.stringify(schema, null, 2));
	},
});

export default showSubcommand;
