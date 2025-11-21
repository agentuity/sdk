import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { logsSubcommand } from './logs';

export const sessionCommand = createCommand({
	name: 'session',
	description: 'Manage sessions',
	tags: ['requires-auth'],
	subcommands: [getSubcommand, listSubcommand, logsSubcommand],
});
