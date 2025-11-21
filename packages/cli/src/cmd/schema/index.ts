import type { CommandDefinition } from '../../types';
import { createCommand } from '../../types';
import { showSubcommand } from './show';

export const schemaCommand: CommandDefinition = createCommand({
	name: 'schema',
	description: 'Output CLI schema in machine-readable format',
	tags: ['read-only', 'fast'],
	subcommands: [showSubcommand],
});

export default schemaCommand;
