import { createCommand } from '../../../types';
import { connectSubcommand } from './connect';
import { disconnectSubcommand } from './disconnect';
import { statusSubcommand } from './status';

export const identityCommand = createCommand({
	name: 'identity',
	description: 'Manage your GitHub identity',
	subcommands: [connectSubcommand, disconnectSubcommand, statusSubcommand],
});

export default identityCommand;
