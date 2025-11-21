import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';
import { resourceSubcommand } from './resource';
import { sessionCommand } from './session';
import { sshSubcommand } from './ssh';
import { scpSubcommand } from './scp';
import { deploymentCommand } from './deployment';

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	tags: ['slow', 'requires-auth'],
	subcommands: [
		deploySubcommand,
		resourceSubcommand,
		sessionCommand,
		sshSubcommand,
		scpSubcommand,
		deploymentCommand,
	],
});
