import { createCommand } from '../../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { getCommand } from '../../../../command-prefix.ts';

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
