import { createCommand } from '../../../types.ts';
import { showSubcommand } from './get.ts';
import { getCommand } from '../../../command-prefix.ts';

export const redisCommand = createCommand({
	name: 'redis',
	description: 'Manage Redis managed resources',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud redis show'), description: 'Show Redis connection URL' },
	],
	subcommands: [showSubcommand],
});
