import { createCommand } from '../../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { getCommand } from '../../../../command-prefix';

export const command = createCommand({
	name: 'destination',
	aliases: ['dest'],
	description: 'Manage schedule destinations',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand],
	examples: [
		{
			command: getCommand('cloud schedule destination list sched_abc123'),
			description: 'List destinations',
		},
		{
			command: getCommand(
				'cloud schedule destination create url sched_abc123 https://example.com'
			),
			description: 'Create URL destination',
		},
	],
});

export default command;
