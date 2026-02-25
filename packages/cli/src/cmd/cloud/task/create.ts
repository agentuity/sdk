import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
import type { TaskPriority, TaskStatus, TaskType } from '@agentuity/core';

const TaskCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	task: z.object({
		id: z.string().describe('Task ID'),
		title: z.string().describe('Task title'),
		type: z.string().describe('Task type'),
		status: z.string().describe('Task status'),
		priority: z.string().describe('Task priority'),
		created_at: z.string().describe('Creation timestamp'),
	}),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new', 'add'],
	description: 'Create a new task',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand(
				'cloud task create "Fix login bug" --type bug --created-id agent_001'
			),
			description: 'Create a bug task',
		},
		{
			command: getCommand(
				'cloud task create "Add dark mode" --type feature --created-id agent_001 --priority high --description "Implement dark mode toggle"'
			),
			description: 'Create a feature with priority and description',
		},
		{
			command: getCommand(
				'cloud task create "Q1 Planning" --type epic --created-id agent_001 --metadata \'{"team":"engineering"}\''
			),
			description: 'Create an epic with metadata',
		},
	],
	schema: {
		args: z.object({
			title: z.string().min(1).describe('the task title'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.describe('the task type'),
			'created-id': z.string().min(1).describe('the ID of the creator (agent or user)'),
			description: z.string().optional().describe('task description'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('task priority (default: none)'),
			status: z
				.enum(['open', 'in_progress', 'closed'])
				.optional()
				.describe('initial task status (default: open)'),
			'parent-id': z.string().optional().describe('parent task ID for subtasks'),
			'assigned-id': z.string().optional().describe('ID of the assigned agent or user'),
			metadata: z.string().optional().describe('JSON metadata object'),
		}),
		response: TaskCreateResponseSchema,
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

		const task = await storage.create({
			title: args.title,
			type: args.type as TaskType,
			created_id: args['created-id'],
			description: args.description,
			priority: (args.priority as TaskPriority) ?? undefined,
			status: (args.status as TaskStatus) ?? undefined,
			parent_id: args['parent-id'],
			assigned_id: args['assigned-id'],
			metadata,
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Task created: ${tui.bold(task.id)}`);
			tui.info(`  Title:    ${task.title}`);
			tui.info(`  Type:     ${task.type}`);
			tui.info(`  Status:   ${task.status}`);
			tui.info(`  Priority: ${task.priority}`);
			tui.info(`  Created:  ${task.created_at}`);
			if (task.description) {
				tui.info(`  Desc:     ${task.description}`);
			}
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
				created_at: task.created_at,
			},
			durationMs,
		};
	},
});

export default createSubcommand;
