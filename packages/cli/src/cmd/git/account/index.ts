import { createCommand } from '../../../types';
import { addSubcommand } from './add';
import { removeSubcommand } from './remove';
import { listSubcommand } from './list';

export const accountCommand = createCommand({
	name: 'account',
	description: 'Manage GitHub accounts connected to your organization',
	subcommands: [addSubcommand, removeSubcommand, listSubcommand],
});

export default accountCommand;
