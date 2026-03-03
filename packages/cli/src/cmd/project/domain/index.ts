import { createCommand } from '../../../types';
import { checkSubcommand } from './check';
import { getCommand } from '../../../command-prefix';

export const domainCommand = createCommand({
	name: 'domain',
	description: 'Manage custom domains for the project',
	tags: ['fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('project domain check'),
			description: 'Check DNS for all custom domains',
		},
		{
			command: getCommand('project domain check --domain example.com'),
			description: 'Check DNS for a specific domain',
		},
	],
	subcommands: [checkSubcommand],
});
