import { createCommand } from '../../types';
import { accountCommand } from './account';
import { linkSubcommand } from './link';
import { listSubcommand } from './list';
import { unlinkSubcommand } from './unlink';
import { statusSubcommand } from './status';

export const gitCommand = createCommand({
	name: 'git',
	description: 'Manage GitHub integration and repository connections',
	subcommands: [accountCommand, linkSubcommand, listSubcommand, unlinkSubcommand, statusSubcommand],
});

export default gitCommand;
