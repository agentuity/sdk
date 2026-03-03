import { createCommand } from '../../../types.ts';
import { deleteSubcommand } from './delete.ts';
import { deleteNamespaceSubcommand } from './delete-namespace.ts';
import { getSubcommand } from './get.ts';
import { listNamespacesSubcommand } from './list-namespaces.ts';
import { searchSubcommand } from './search.ts';
import { statsSubcommand } from './stats.ts';
import { upsertSubcommand } from './upsert.ts';
import { getCommand } from '../../../command-prefix.ts';

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
	requires: { auth: true },
});

export default vectorCommand;
