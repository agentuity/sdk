import { createCommand } from '../../../types';
import { addSubcommand } from './add';
import { listSubcommand } from './list';
import { removeSubcommand } from './remove';

export const accountCommand = createCommand({
	name: 'account',
	description: 'Manage GitHub App installations',
	subcommands: [addSubcommand, listSubcommand, removeSubcommand],
});
