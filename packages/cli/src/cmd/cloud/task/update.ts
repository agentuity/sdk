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
			'assigned-id': z.string().optional().describe('new assigned agent or user ID'),
			'parent-id': z.string().optional().describe('new parent task ID'),
			'closed-id': z.string().optional().describe('ID of the closer (agent or user)'),
			metadata: z.string().optional().describe('JSON metadata object'),
		}),
		response: TaskUpdateResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = createStorageAdapter(ctx);

		let metadata: Record<string, unknown> | undefined;
		if (args.metadata) {
			try {
				metadata = JSON.parse(args.metadata) as Record<string, unknown>;
			} catch {
				tui.fatal('Invalid JSON for --metadata flag');
			}
		}

		const params: Record<string, unknown> = {};
		if (args.title !== undefined) params.title = args.title;
		if (args.description !== undefined) params.description = args.description;
		if (args.priority !== undefined) params.priority = args.priority as TaskPriority;
		if (args.type !== undefined) params.type = args.type as TaskType;
		if (args.status !== undefined) params.status = args.status as TaskStatus;
		if (args['assigned-id'] !== undefined) params.assigned_id = args['assigned-id'];
		if (args['parent-id'] !== undefined) params.parent_id = args['parent-id'];
		if (args['closed-id'] !== undefined) params.closed_id = args['closed-id'];
		if (metadata !== undefined) params.metadata = metadata;

		if (Object.keys(params).length === 0) {
			tui.fatal('No update fields provided. Use --title, --status, --priority, etc.');
		}

		const task = await storage.update(args.id, params);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Task updated: ${tui.bold(task.id)}`);
			tui.info(`  Title:    ${task.title}`);
			tui.info(`  Type:     ${task.type}`);
			tui.info(`  Status:   ${task.status}`);
			tui.info(`  Priority: ${task.priority}`);
			tui.info(`  Updated:  ${task.updated_at}`);
			tui.info(`  (${durationMs.toFixed(1)}ms)`);
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
