import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';
import { resourceSubcommand } from './resource';
import { sshSubcommand } from './ssh';
import { scpSubcommand } from './scp';

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	subcommands: [deploySubcommand, resourceSubcommand, sshSubcommand, scpSubcommand],
});
