import type { CommandDefinition } from '../../../types.ts';
import { createCommand } from '../../../types.ts';
import { showSubcommand } from './show.ts';
import { generateSubcommand } from './generate.ts';
import { getCommand } from '../../../command-prefix.ts';

export const schemaCommand: CommandDefinition = createCommand({
	name: 'schema',
	description: 'Output CLI schema in machine-readable format',
	tags: ['read-only', 'fast'],
	examples: [{ command: getCommand('ai schema show'), description: 'Show CLI schema as JSON' }],
	subcommands: [showSubcommand, generateSubcommand],
});

export default schemaCommand;
