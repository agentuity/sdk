import { createCommand } from '../../types';
import { accountCommand } from './account';
import { identityCommand } from './identity';
import { linkSubcommand } from './link';
import { listSubcommand } from './list';
import { statusSubcommand } from './status';
import { unlinkSubcommand } from './unlink';

export const gitCommand = createCommand({
	name: 'git',
	description: 'Manage GitHub integration and repository connections',
	subcommands: [
		identityCommand,
		accountCommand,
		linkSubcommand,
		listSubcommand,
		unlinkSubcommand,
		statusSubcommand,
	],
});

export default gitCommand;
