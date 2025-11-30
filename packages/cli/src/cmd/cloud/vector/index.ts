import { createCommand } from '../../../types';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { searchSubcommand } from './search';
import { getCommand } from '../../../command-prefix';

export const vectorCommand = createCommand({
	name: 'vector',
	aliases: ['vec'],
	description: 'Manage vector storage for your projects',
	tags: ['requires-auth', 'destructive', 'deletes-resource', 'slow'],
	examples: [
		{
			command: getCommand('cloud vector search "query text"'),
			description: 'Search vector storage',
		},
		{ command: getCommand('cloud vec get <id>'), description: 'Get vector by ID' },
	],
	subcommands: [searchSubcommand, getSubcommand, deleteSubcommand],
	requires: { auth: true, project: true },
});

export default vectorCommand;
