import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'apikey',
	description: 'Manage API keys',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud apikey list'), description: 'List all API keys' },
		{
			command: getCommand('cloud apikey create --name "My Key" --expires-at 1y'),
			description: 'Create new API key',
		},
	],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand],
});
export default command;
