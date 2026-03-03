import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { logsSubcommand } from './logs';
import { getCommand } from '../../../command-prefix';

export const sessionCommand = createCommand({
	name: 'session',
	description: 'Manage sessions',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud session list'), description: 'List all sessions' },
		{ command: getCommand('cloud session logs <id>'), description: 'View session logs' },
	],
	subcommands: [getSubcommand, listSubcommand, logsSubcommand],
});
