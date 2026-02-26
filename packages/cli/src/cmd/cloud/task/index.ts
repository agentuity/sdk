import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { createSubcommand } from './create';
import { updateSubcommand } from './update';
import { listSubcommand } from './list';
import { statsSubcommand } from './stats';
import { getCommand } from '../../../command-prefix';

export const taskCommand = createCommand({
	name: 'task',
	description: 'Manage tasks for your projects',
	tags: ['requires-auth', 'slow'],
	examples: [
		{
			command: getCommand('cloud task get task_abc123'),
			description: 'Get task details',
		},
		{
			command: getCommand('cloud task create "Fix bug" --type bug --created-id agent_001'),
			description: 'Create a new bug task',
		},
		{
			command: getCommand('cloud task list --status open'),
			description: 'List open tasks',
		},
		{
			command: getCommand('cloud task update task_abc123 --status in_progress'),
			description: 'Update task status',
		},
	],
	subcommands: [getSubcommand, createSubcommand, updateSubcommand, listSubcommand, statsSubcommand],
	requires: { auth: true },
});

export default taskCommand;
