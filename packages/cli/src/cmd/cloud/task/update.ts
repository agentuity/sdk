import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
import type { TaskPriority, TaskStatus, TaskType } from '@agentuity/core';

const TaskUpdateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	task: z.object({
		id: z.string().describe('Task ID'),
		title: z.string().describe('Task title'),
		type: z.string().describe('Task type'),
		status: z.string().describe('Task status'),
		priority: z.string().describe('Task priority'),
		updated_at: z.string().describe('Last update timestamp'),
	}),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const updateSubcommand = createCommand({
	name: 'update',
	aliases: ['edit'],
	description: 'Update an existing task',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('cloud task update task_abc123 --status in_progress'),
			description: 'Move task to in-progress',
		},
		{
			command: getCommand(
				'cloud task update task_abc123 --title "Updated title" --priority high'
			),
			description: 'Update title and priority',
		},
		{
			command: getCommand('cloud task update task_abc123 --assigned-id agent_002'),
			description: 'Reassign a task',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the task ID to update'),
		}),
		options: z.object({
			title: z.string().optional().describe('new task title'),
			description: z.string().optional().describe('new task description'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('new task priority'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.optional()
				.describe('new task type'),
			status: z
				.enum(['open', 'in_progress', 'closed'])
				.optional()
				.describe('new task status'),
			assignedId: z.string().optional().describe('new assigned agent or user ID'),
			parentId: z.string().optional().describe('new parent task ID'),
			closedId: z.string().optional().describe('ID of the closer (agent or user)'),
			metadata: z.string().optional().describe('JSON metadata object'),
		}),
		response: TaskUpdateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = createStorageAdapter(ctx);

		let metadata: Record<string, unknown> | undefined;
		if (opts.metadata) {
			try {
				metadata = JSON.parse(opts.metadata) as Record<string, unknown>;
			} catch {
				tui.fatal('Invalid JSON for --metadata flag');
			}
		}

		const params: Record<string, unknown> = {};
		if (opts.title !== undefined) params.title = opts.title;
		if (opts.description !== undefined) params.description = opts.description;
		if (opts.priority !== undefined) params.priority = opts.priority as TaskPriority;
		if (opts.type !== undefined) params.type = opts.type as TaskType;
		if (opts.status !== undefined) params.status = opts.status as TaskStatus;
		if (opts.assignedId !== undefined) params.assigned_id = opts.assignedId;
		if (opts.parentId !== undefined) params.parent_id = opts.parentId;
		if (opts.closedId !== undefined) params.closed_id = opts.closedId;
		if (metadata !== undefined) params.metadata = metadata;

		if (Object.keys(params).length === 0) {
			tui.fatal('No update fields provided. Use --title, --status, --priority, etc.');
		}

		const task = await storage.update(args.id, params);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Task updated: ${tui.bold(task.id)}`);

			const tableData: Record<string, string> = {
				Title: task.title,
				Type: task.type,
				Status: task.status,
				Priority: task.priority,
				Updated: new Date(task.updated_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			task: {
				id: task.id,
				title: task.title,
				type: task.type,
				status: task.status,
				priority: task.priority,
				updated_at: task.updated_at,
			},
			durationMs,
		};
	},
});

export default updateSubcommand;
