import { createCommand } from '../../../types';
import { deleteSubcommand } from './delete';
import { deleteNamespaceSubcommand } from './delete-namespace';
import { getSubcommand } from './get';
import { listNamespacesSubcommand } from './list-namespaces';
import { searchSubcommand } from './search';
import { statsSubcommand } from './stats';
import { upsertSubcommand } from './upsert';
import { getCommand } from '../../../command-prefix';

export const vectorCommand = createCommand({
	name: 'vector',
	aliases: ['vec'],
	description: 'Manage vector storage for your projects',
	tags: ['requires-auth', 'slow'],
	examples: [
		{
			command: getCommand('cloud vector search products "query text"'),
			description: 'Search vector storage',
		},
		{
			command: getCommand('cloud vec upsert products doc1 --document "text"'),
			description: 'Upsert a vector',
		},
		{ command: getCommand('cloud vec get products doc1'), description: 'Get vector by key' },
		{ command: getCommand('cloud vec stats'), description: 'Show namespace statistics' },
	],
	subcommands: [
		upsertSubcommand,
		searchSubcommand,
		getSubcommand,
		deleteSubcommand,
		statsSubcommand,
		listNamespacesSubcommand,
		deleteNamespaceSubcommand,
	],
	requires: { auth: true, project: true },
});

export default vectorCommand;
