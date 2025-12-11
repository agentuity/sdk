import { createCommand } from '../../../types';
import { showSubcommand } from './get';
import { getCommand } from '../../../command-prefix';

export const redisCommand = createCommand({
	name: 'redis',
	description: 'Manage Redis resources',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud redis show'), description: 'Show Redis connection URL' },
	],
	subcommands: [showSubcommand],
});
