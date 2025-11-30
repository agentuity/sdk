import { createCommand } from '../../../types';
import { createNamespaceSubcommand } from './create-namespace';
import { deleteSubcommand } from './delete';
import { deleteNamespaceSubcommand } from './delete-namespace';
import { getSubcommand } from './get';
import { keysSubcommand } from './keys';
import { listNamespacesSubcommand } from './list-namespaces';
import { replSubcommand } from './repl';
import { searchSubcommand } from './search';
import { setSubcommand } from './set';
import { statsSubcommand } from './stats';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'keyvalue',
	aliases: ['kv'],
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
	requires: { auth: true, project: true },
});
export default command;
