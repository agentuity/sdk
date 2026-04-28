import { createCommand } from '../../../types.ts';
import { listCommand } from './list.ts';
import { addCommand } from './add.ts';
import { deleteCommand } from './delete.ts';
import { getCommand } from '../../../command-prefix.ts';

export const sshSubcommand = createCommand({
	name: 'ssh',
	description: 'Manage SSH keys',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('auth ssh list'), description: 'List all SSH keys' },
		{ command: getCommand('auth ssh add'), description: 'Add a new SSH key' },
	],
	subcommands: [listCommand, addCommand, deleteCommand],
});
