import type { SubcommandDefinition } from '../../../types';
import { listCommand } from './list';
import { addCommand } from './add';
import { deleteCommand } from './delete';

export const sshSubcommand: SubcommandDefinition = {
	name: 'ssh',
	description: 'Manage SSH keys',
	subcommands: [listCommand, addCommand, deleteCommand],
};
