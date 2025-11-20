import { createCommand } from '../../types';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { replSubcommand } from './repl';
import { setSubcommand } from './set';

export const command = createCommand({
	name: 'keyvalue',
	aliases: ['kv'],
	description: 'Manage keyvalue storage for your projects',
	subcommands: [replSubcommand, getSubcommand, setSubcommand, deleteSubcommand],
	requires: { auth: true, project: true },
});
