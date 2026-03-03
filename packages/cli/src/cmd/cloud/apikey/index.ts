import { createCommand } from '../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { getCommand } from '../../../command-prefix.ts';

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
