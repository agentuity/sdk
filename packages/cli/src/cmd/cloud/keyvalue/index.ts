import { createCommand } from '../../../types.ts';
import { createNamespaceSubcommand } from './create-namespace.ts';
import { deleteSubcommand } from './delete.ts';
import { deleteNamespaceSubcommand } from './delete-namespace.ts';
import { getSubcommand } from './get.ts';
import { keysSubcommand } from './keys.ts';
import { listNamespacesSubcommand } from './list-namespaces.ts';
import { replSubcommand } from './repl.ts';
import { searchSubcommand } from './search.ts';
import { setSubcommand } from './set.ts';
import { statsSubcommand } from './stats.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'keyvalue',
	aliases: ['kv', 'keyvalues'],
	description: 'Manage keyvalue storage for your projects',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud keyvalue repl'),
			description: 'Start interactive key-value REPL',
		},
		{ command: getCommand('cloud kv get mykey'), description: 'Get value for key' },
	],
	subcommands: [
		replSubcommand,
		getSubcommand,
		setSubcommand,
		deleteSubcommand,
		statsSubcommand,
		searchSubcommand,
		keysSubcommand,
		listNamespacesSubcommand,
		createNamespaceSubcommand,
		deleteNamespaceSubcommand,
	],
	requires: { auth: true },
});
export default command;
