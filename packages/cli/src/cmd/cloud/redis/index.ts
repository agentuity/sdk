import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { getCommand } from '../../../command-prefix';

export const redisCommand = createCommand({
	name: 'redis',
	description: 'Manage Redis resources',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud redis get'), description: 'Get Redis connection URL' },
	],
	subcommands: [getSubcommand],
});
