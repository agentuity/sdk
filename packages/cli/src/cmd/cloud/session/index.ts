import { createCommand } from '../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { logsSubcommand } from './logs.ts';
import { getCommand } from '../../../command-prefix.ts';

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
