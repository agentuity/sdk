import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { setSubcommand } from './set';
import { getCommand } from '../../../command-prefix';

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
