import { createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { setSubcommand } from './set';

export const configSubcommand = createCommand({
	name: 'config',
	description: 'Manage stored Coder Hub configuration',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('coder config set url https://hub.example.com'),
			description: 'Set the default Coder Hub URL for the active profile',
		},
		{
			command: getCommand('coder config set apikey agc_...'),
			description: 'Set the default Coder Hub API key for the active profile',
		},
	],
	subcommands: [setSubcommand],
});
