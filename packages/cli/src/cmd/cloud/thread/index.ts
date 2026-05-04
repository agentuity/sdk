import { createCommand } from '../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { deleteSubcommand } from './delete.ts';
import { getCommand } from '../../../command-prefix.ts';

export const threadCommand = createCommand({
	name: 'thread',
	aliases: ['threads'],
	description: 'Manage threads',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud thread list'), description: 'List all threads' },
		{ command: getCommand('cloud thread get <id>'), description: 'Get thread details' },
		{ command: getCommand('cloud thread delete <id>'), description: 'Delete a thread' },
	],
	subcommands: [getSubcommand, listSubcommand, deleteSubcommand],
});
