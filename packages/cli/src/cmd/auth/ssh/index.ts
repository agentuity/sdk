import { createCommand } from '../../../types';
import { listCommand } from './list';
import { addCommand } from './add';
import { deleteCommand } from './delete';

export const sshSubcommand = createCommand({
	name: 'ssh',
	description: 'Manage SSH keys',
	tags: ['fast', 'requires-auth'],
	subcommands: [listCommand, addCommand, deleteCommand],
});
