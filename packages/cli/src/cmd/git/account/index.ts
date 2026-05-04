import { createCommand } from '../../../types.ts';
import { addSubcommand } from './add.ts';
import { listSubcommand } from './list.ts';
import { removeSubcommand } from './remove.ts';

export const accountCommand = createCommand({
	name: 'account',
	description: 'Manage GitHub App installations',
	subcommands: [addSubcommand, listSubcommand, removeSubcommand],
});
