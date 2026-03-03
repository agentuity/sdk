import { createCommand } from '../../../types';
import { listCommand } from './list';
import { addCommand } from './add';
import { deleteCommand } from './delete';
import { getCommand } from '../../../command-prefix';

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
