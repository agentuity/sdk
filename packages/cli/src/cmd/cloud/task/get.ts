import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter, cacheTaskId } from './util';
import { getCommand } from '../../../command-prefix';

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
		assigned_id: z.string().optional().describe('Assigned agent or user ID'),
		created_id: z.string().describe('Creator ID'),
		closed_id: z.string().optional().describe('Closer ID'),
		metadata: z.record(z.string(), z.unknown()).optional().describe('Task metadata'),
		created_at: z.string().describe('Creation timestamp'),
		updated_at: z.string().describe('Last update timestamp'),
		open_date: z.string().optional().describe('Date task was opened'),
		in_progress_date: z.string().optional().describe('Date task moved to in-progress'),
		closed_date: z.string().optional().describe('Date task was closed'),
	}),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get details of a task by ID',
	tags: ['read-only', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('cloud task get task_abc123'),
			description: 'Get task details',
		},
		{
			command: getCommand('cloud task get task_abc123 --json'),
			description: 'Get task details as JSON',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the task ID to get'),
		}),
		response: TaskGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const task = await storage.get(args.id);
		const durationMs = Date.now() - started;

		if (!task) {
			tui.fatal(`Task not found: ${args.id}`);
		}

		await cacheTaskId(ctx, task.id);

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

			tableData['Creator'] = task.created_id;

			if (task.assigned_id) {
				tableData['Assigned'] = task.assigned_id;
			}
			if (task.parent_id) {
				tableData['Parent'] = task.parent_id;
			}
			if (task.closed_id) {
				tableData['Closed By'] = task.closed_id;
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
			if (task.metadata && Object.keys(task.metadata).length > 0) {
				tableData['Metadata'] = JSON.stringify(task.metadata);
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
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
				assigned_id: task.assigned_id,
				created_id: task.created_id,
				closed_id: task.closed_id,
				metadata: task.metadata,
				created_at: task.created_at,
				updated_at: task.updated_at,
				open_date: task.open_date,
				in_progress_date: task.in_progress_date,
				closed_date: task.closed_date,
			},
			durationMs,
		};
	},
});

export default getSubcommand;
