import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { createSubcommand } from './create';
import { updateSubcommand } from './update';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { statsSubcommand } from './stats';
import { attachmentSubcommand } from './attachment';
import { userSubcommand } from './user';
import { projectSubcommand } from './project';
import { getCommand } from '../../../command-prefix';

export const taskCommand = createCommand({
	name: 'task',
	aliases: ['tasks'],
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
		{
			command: getCommand('cloud task delete task_abc123'),
			description: 'Delete a task by ID',
		},
		{
			command: getCommand('cloud task delete --status done --older-than 7d'),
			description: 'Batch delete done tasks older than 7 days',
		},
		{
			command: getCommand('cloud task attachment upload task_abc123 ./report.pdf'),
			description: 'Upload a file attachment to a task',
		},
		{
			command: getCommand('cloud task user list'),
			description: 'List task users',
		},
		{
			command: getCommand('cloud task project list'),
			description: 'List task projects',
		},
	],
	subcommands: [
		getSubcommand,
		createSubcommand,
		updateSubcommand,
		listSubcommand,
		deleteSubcommand,
		statsSubcommand,
		attachmentSubcommand,
		userSubcommand,
		projectSubcommand,
	],
	requires: { auth: true },
});

export default taskCommand;
