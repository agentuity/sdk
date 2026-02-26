import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
import type { TaskPriority, TaskStatus, TaskType, Task } from '@agentuity/core';

const TaskListResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	tasks: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			type: z.string(),
			status: z.string(),
			priority: z.string(),
			assigned_id: z.string().optional(),
			created_at: z.string(),
			updated_at: z.string(),
		})
	),
	total: z.number().describe('Total number of matching tasks'),
	limit: z.number().describe('Page size'),
	offset: z.number().describe('Page offset'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

const PRIORITY_COLORS: Record<string, (s: string) => string> = {
	high: tui.colorError,
	medium: tui.colorWarning,
	low: tui.colorInfo,
	none: tui.muted,
};

const STATUS_COLORS: Record<string, (s: string) => string> = {
	open: tui.colorSuccess,
	in_progress: tui.colorWarning,
	closed: tui.muted,
};

function formatPriority(p: string): string {
	const colorFn = PRIORITY_COLORS[p] ?? tui.muted;
	return colorFn(p);
}

function formatStatus(s: string): string {
	const colorFn = STATUS_COLORS[s] ?? tui.muted;
	return colorFn(s);
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List tasks with optional filtering and sorting',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	pagination: {
		supported: true,
		defaultLimit: 50,
		maxLimit: 100,
		parameters: { limit: 'limit', offset: 'offset' },
	},
	examples: [
		{
			command: getCommand('cloud task list'),
			description: 'List all tasks',
		},
		{
			command: getCommand('cloud task list --status open --priority high'),
			description: 'List open high-priority tasks',
		},
		{
			command: getCommand('cloud task list --type bug --sort created_at --order asc'),
			description: 'List bugs sorted by oldest first',
		},
		{
			command: getCommand('cloud task list --assigned-id agent_001 --limit 10'),
			description: 'List first 10 tasks assigned to an agent',
		},
	],
	schema: {
		options: z.object({
			status: z.enum(['open', 'in_progress', 'closed']).optional().describe('filter by status'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.optional()
				.describe('filter by type'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('filter by priority'),
			assignedId: z.string().optional().describe('filter by assigned agent or user ID'),
			parentId: z.string().optional().describe('filter by parent task ID'),
			sort: z
				.enum([
					'created_at',
					'updated_at',
					'priority',
					'status',
					'title',
					'type',
					'open_date',
					'in_progress_date',
					'closed_date',
				])
				.optional()
				.describe('field to sort by (default: created_at)'),
			order: z.enum(['asc', 'desc']).optional().describe('sort order (default: desc)'),
			limit: z.coerce.number().optional().describe('max results to return (default: 50)'),
			offset: z.coerce.number().optional().describe('offset for pagination'),
		}),
		response: TaskListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const result = await storage.list({
			status: opts.status as TaskStatus | undefined,
			type: opts.type as TaskType | undefined,
			priority: opts.priority as TaskPriority | undefined,
			assigned_id: opts.assignedId,
			parent_id: opts.parentId,
			sort: opts.sort,
			order: opts.order,
			limit: opts.limit,
			offset: opts.offset,
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.tasks.length === 0) {
				tui.info('No tasks found');
			} else {
				const tableData = result.tasks.map((task: Task) => ({
					ID: tui.muted(truncate(task.id, 28)),
					Title: truncate(task.title, 40),
					Type: task.type,
					Status: formatStatus(task.status),
					Priority: formatPriority(task.priority),
					Assigned: task.assigned_id ?? tui.muted('—'),
					Updated: new Date(task.updated_at).toLocaleDateString(),
				}));

				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Title', alignment: 'left' },
					{ name: 'Type', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
					{ name: 'Priority', alignment: 'left' },
					{ name: 'Assigned', alignment: 'left' },
					{ name: 'Updated', alignment: 'left' },
				]);

				tui.info(
					`Showing ${result.tasks.length} of ${result.total} ${tui.plural(result.total, 'task', 'tasks')} (${durationMs.toFixed(1)}ms)`
				);
			}
		}

		return {
			success: true,
			tasks: result.tasks.map((task: Task) => ({
				id: task.id,
				title: task.title,
				type: task.type,
				status: task.status,
				priority: task.priority,
				assigned_id: task.assigned_id,
				created_at: task.created_at,
				updated_at: task.updated_at,
			})),
			total: result.total,
			limit: result.limit,
			offset: result.offset,
			durationMs,
		};
	},
});

export default listSubcommand;
