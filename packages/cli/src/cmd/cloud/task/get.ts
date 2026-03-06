import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapterOptionalOrg, cacheTaskId } from './util';
import { getCommand } from '../../../command-prefix';

const EntityRefSchema = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.optional();

const UserEntityRefSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		type: z.enum(['human', 'agent']).optional(),
	})
	.optional();

const SubtaskSchema = z.object({
	id: z.string().describe('Subtask ID'),
	title: z.string().describe('Subtask title'),
	type: z.string().describe('Subtask type'),
	status: z.string().describe('Subtask status'),
	priority: z.string().describe('Subtask priority'),
	assignee: UserEntityRefSchema.describe('Subtask assignee'),
});

const TaskGetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	task: z.object({
		id: z.string().describe('Task ID'),
		title: z.string().describe('Task title'),
		description: z.string().optional().describe('Task description'),
		type: z.string().describe('Task type'),
		status: z.string().describe('Task status'),
		priority: z.string().describe('Task priority'),
		parent_id: z.string().optional().describe('Parent task ID'),
		creator: UserEntityRefSchema.describe('Creator'),
		assignee: UserEntityRefSchema.describe('Assignee'),
		closer: UserEntityRefSchema.describe('Closer'),
		project: EntityRefSchema.describe('Project'),
		metadata: z.record(z.string(), z.unknown()).optional().describe('Task metadata'),
		created_at: z.string().describe('Creation timestamp'),
		updated_at: z.string().describe('Last update timestamp'),
		open_date: z.string().optional().describe('Date task was opened'),
		in_progress_date: z.string().optional().describe('Date task moved to in-progress'),
		closed_date: z.string().optional().describe('Date task was closed'),
		cancelled_date: z.string().optional().describe('Date task was cancelled'),
	}),
	subtasks: z.array(SubtaskSchema).optional().describe('Subtasks of this task'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get details of a task by ID',
	tags: ['read-only', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task get task_abc123'),
			description: 'Get task details',
		},
		{
			command: getCommand('cloud task get task_abc123 --json'),
			description: 'Get task details as JSON',
		},
		{
			command: getCommand('cloud task get task_abc123 --no-subtasks'),
			description: 'Get task details without subtasks',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the task ID to get'),
		}),
		options: z.object({
			'no-subtasks': z.boolean().optional().describe('Do not show subtasks'),
		}),
		response: TaskGetResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapterOptionalOrg(ctx);

		const task = await storage.get(args.id);

		if (!task) {
			tui.fatal(`Task not found: ${args.id}`);
		}

		await cacheTaskId(ctx, task.id);

		// Fetch subtasks unless disabled
		let subtasksList: {
			id: string;
			title: string;
			type: string;
			status: string;
			priority: string;
			assignee?: { id: string; name: string; type?: 'human' | 'agent' };
		}[] = [];
		let subtasksError: string | undefined;
		if (!opts['no-subtasks']) {
			try {
				const subtasksResult = await storage.list({ parent_id: task.id });
				subtasksList = subtasksResult.tasks.map((st) => ({
					id: st.id,
					title: st.title,
					type: st.type,
					status: st.status,
					priority: st.priority,
					assignee: st.assignee,
				}));
			} catch (err) {
				subtasksError = err instanceof Error ? err.message : 'Failed to fetch subtasks';
				if (!options.json) {
					tui.warn(`Could not load subtasks: ${subtasksError}`);
				}
			}
		}

		const durationMs = Date.now() - started;

		if (!options.json) {
			const tableData: Record<string, string> = {
				ID: task.id,
				Title: task.title,
				Type: task.type,
				Status: task.status,
				Priority: task.priority,
			};

			if (task.description) {
				tableData['Description'] = task.description;
			}

			if (task.creator) {
				tableData['Creator'] = `${task.creator.name} (${task.creator.id})`;
			}
			if (task.assignee) {
				tableData['Assigned'] = `${task.assignee.name} (${task.assignee.id})`;
			}
			if (task.project) {
				tableData['Project'] = `${task.project.name} (${task.project.id})`;
			}
			if (task.parent_id) {
				tableData['Parent'] = task.parent_id;
			}
			if (task.closer) {
				tableData['Closed By'] = `${task.closer.name} (${task.closer.id})`;
			}

			tableData['Created'] = new Date(task.created_at).toLocaleString();
			tableData['Updated'] = new Date(task.updated_at).toLocaleString();

			if (task.open_date) {
				tableData['Opened'] = new Date(task.open_date).toLocaleString();
			}
			if (task.in_progress_date) {
				tableData['In Progress'] = new Date(task.in_progress_date).toLocaleString();
			}
			if (task.closed_date) {
				tableData['Closed'] = new Date(task.closed_date).toLocaleString();
			}
			if (task.cancelled_date) {
				tableData['Cancelled'] = new Date(task.cancelled_date).toLocaleString();
			}
			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			if (task.metadata && Object.keys(task.metadata).length > 0) {
				tui.newline();
				tui.header('Metadata');
				tui.json(task.metadata);
			}

			// Show subtasks
			if (subtasksList.length > 0) {
				tui.newline();
				tui.header('Subtasks');
				const subtaskRows = subtasksList.map((st) => ({
					ID: st.id,
					Title: st.title,
					Type: st.type,
					Status: st.status,
					Priority: st.priority,
					Assignee: st.assignee?.name ?? 'Unassigned',
				}));
				tui.table(subtaskRows, ['ID', 'Title', 'Type', 'Status', 'Priority', 'Assignee']);
			}
		}

		return {
			success: true,
			task: {
				id: task.id,
				title: task.title,
				description: task.description,
				type: task.type,
				status: task.status,
				priority: task.priority,
				parent_id: task.parent_id,
				creator: task.creator,
				assignee: task.assignee,
				closer: task.closer,
				project: task.project,
				metadata: task.metadata,
				created_at: task.created_at,
				updated_at: task.updated_at,
				open_date: task.open_date,
				in_progress_date: task.in_progress_date,
				closed_date: task.closed_date,
				cancelled_date: task.cancelled_date,
			},
			subtasks: subtasksList.length > 0 ? subtasksList : undefined,
			subtasksError,
			durationMs,
		};
	},
});

export default getSubcommand;
