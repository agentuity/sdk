import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { createSubcommand } from './create.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { updateSubcommand } from './update.ts';
import destinationSubcommand from './destination/index.ts';
import deliverySubcommand from './delivery/index.ts';
import { statsSubcommand } from './stats.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'schedule',
	aliases: ['schedules', 'sched'],
	description: 'Manage scheduled tasks',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [
		listSubcommand,
		createSubcommand,
		getSubcommand,
		deleteSubcommand,
		updateSubcommand,
		destinationSubcommand,
		deliverySubcommand,
		statsSubcommand,
	],
	examples: [
		{ command: getCommand('cloud schedule list'), description: 'List schedules' },
		{
			command: getCommand("cloud schedule create --name nightly --expression '0 0 * * *'"),
			description: 'Create a schedule',
		},
		{
			command: getCommand('cloud schedule get sched_abc123'),
			description: 'Get schedule details',
		},
	],
});

export default command;
