import type { CommandDefinition } from '../../../types';
import { createCommand } from '../../../types';
import { showSubcommand } from './show';
import { generateSubcommand } from './generate';
import { getCommand } from '../../../command-prefix';

export const schemaCommand: CommandDefinition = createCommand({
	name: 'schema',
	description: 'Output CLI schema in machine-readable format',
	tags: ['read-only', 'fast'],
	examples: [{ command: getCommand('ai schema show'), description: 'Show CLI schema as JSON' }],
	subcommands: [showSubcommand, generateSubcommand],
});

export default schemaCommand;
