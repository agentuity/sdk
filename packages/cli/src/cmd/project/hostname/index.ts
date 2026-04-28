import { createCommand } from '../../../types.ts';
import { getSubcommand } from './get.ts';
import { setSubcommand } from './set.ts';
import { getCommand } from '../../../command-prefix.ts';

export const hostnameCommand = createCommand({
	name: 'hostname',
	description: 'Manage the project vanity hostname on agentuity.run',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('project hostname get'), description: 'Show current hostname' },
		{
			command: getCommand('project hostname set my-cool-api'),
			description: 'Set a custom hostname',
		},
	],
	subcommands: [getSubcommand, setSubcommand],
});
