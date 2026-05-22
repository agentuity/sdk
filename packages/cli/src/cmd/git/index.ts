import { createCommand } from '../../types.ts';
import { accountCommand } from './account/index.ts';
import { identityCommand } from './identity/index.ts';
import { linkSubcommand } from './link.ts';
import { listSubcommand } from './list.ts';
import { statusSubcommand } from './status.ts';
import { unlinkSubcommand } from './unlink.ts';

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
