import { createCommand } from '../../../types.ts';
import { connectSubcommand } from './connect.ts';
import { disconnectSubcommand } from './disconnect.ts';
import { statusSubcommand } from './status.ts';

export const identityCommand = createCommand({
	name: 'identity',
	description: 'Manage your GitHub identity',
	subcommands: [connectSubcommand, disconnectSubcommand, statusSubcommand],
});
