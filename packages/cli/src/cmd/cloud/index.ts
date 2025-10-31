import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	subcommands: [deploySubcommand],
});
