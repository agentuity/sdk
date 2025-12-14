import { createCommand } from '../../../types';
import { linkSubcommand } from './link';
import { getCommand } from '../../../command-prefix';

export const skillsCommand = createCommand({
	name: 'skills',
	description: 'Manage Agentuity AI skills for Claude/Amp coding agents',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai skills link'),
			description: 'Link Agentuity package skills into .claude/skills',
		},
	],
	subcommands: [linkSubcommand],
});

export default skillsCommand;
