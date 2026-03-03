import { createCommand } from '../../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { getCommand } from '../../../../command-prefix';

export const command = createCommand({
	name: 'delivery',
	description: 'Manage schedule delivery attempts',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
	examples: [
		{
			command: getCommand('cloud schedule delivery list sched_abc123'),
			description: 'List deliveries for schedule',
		},
		{
			command: getCommand('cloud schedule delivery get sched_abc123 sdel_abc456'),
			description: 'Get delivery details',
		},
	],
});

export default command;
