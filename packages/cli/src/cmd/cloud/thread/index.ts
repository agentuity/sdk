import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getCommand } from '../../../command-prefix';

export const threadCommand = createCommand({
	name: 'thread',
	description: 'Manage threads',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud thread list'), description: 'List all threads' },
		{ command: getCommand('cloud thread get <id>'), description: 'Get thread details' },
		{ command: getCommand('cloud thread delete <id>'), description: 'Delete a thread' },
	],
	subcommands: [getSubcommand, listSubcommand, deleteSubcommand],
});
