import { createCommand } from '../../../types';
import { initSubcommand } from './init';
import { generateSubcommand } from './generate';
import { getCommand } from '../../../command-prefix';

export const authCommand = createCommand({
	name: 'auth',
	description: 'Manage project authentication (Agentuity Auth)',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('project auth init'),
			description: 'Set up Agentuity Auth for an existing project',
		},
		{
			command: getCommand('project auth generate'),
			description: 'Generate SQL schema for auth tables',
		},
	],
	subcommands: [initSubcommand, generateSubcommand],
});
