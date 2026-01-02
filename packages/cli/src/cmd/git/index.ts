import { createCommand } from '../../types';
import { accountCommand } from './account';
import { linkSubcommand } from './link';
import { unlinkSubcommand } from './unlink';
import { statusSubcommand } from './status';

export const gitCommand = createCommand({
	name: 'git',
	description: 'Manage GitHub integration and repository connections',
	subcommands: [accountCommand, linkSubcommand, unlinkSubcommand, statusSubcommand],
});

export default gitCommand;
