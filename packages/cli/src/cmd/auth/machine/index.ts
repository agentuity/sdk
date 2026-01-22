import { createCommand } from '../../../types';
import { setupSubcommand } from './setup';
import { getCommand } from '../../../command-prefix';

export const machineSubcommand = createCommand({
	name: 'machine',
	description: 'Manage machine authentication for self-hosted infrastructure',
	tags: ['fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('auth machine setup --file ./public-key.pem'),
			description: 'Set up machine authentication with a public key',
		},
	],
	subcommands: [setupSubcommand],
});
