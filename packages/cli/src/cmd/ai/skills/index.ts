import type { CommandDefinition } from '../../../types';
import { createCommand } from '../../../types';
import { generateSubcommand } from './generate';
import { getCommand } from '../../../command-prefix';

export const skillsCommand: CommandDefinition = createCommand({
	name: 'skills',
	description: 'Generate Agent Skills from CLI schema',
	tags: ['read-only', 'fast'],
	examples: [
		{
			command: getCommand('ai skills generate --output ./skills'),
			description: 'Generate skills to a directory',
		},
		{
			command: getCommand('--dry-run ai skills generate --output ./skills'),
			description: 'Preview without writing files',
		},
	],
	subcommands: [generateSubcommand],
});

export default skillsCommand;
