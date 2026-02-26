import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { createSubcommand } from './create';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { updateSubcommand } from './update';
import destinationSubcommand from './destination';
import deliverySubcommand from './delivery';
import { statsSubcommand } from './stats';
import { getCommand } from '../../../command-prefix';

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
		{ command: getCommand('cloud schedule get sched_abc123'), description: 'Get schedule details' },
	],
});

export default command;
