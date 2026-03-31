import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter, resolveMeId } from './util';
import { getCommand } from '../../../command-prefix';
import type { TaskPriority, TaskStatus, TaskType, Task, TaskIncludeField } from '@agentuity/core';

const TaskListResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	tasks: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			type: z.string(),
			status: z.string(),
			priority: z.string(),
			description: z.string().optional(),
			metadata: z.record(z.string(), z.unknown()).optional(),
			tags: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
			subtask_count: z.number().optional(),
			created_id: z.string().optional(),
			deleted: z.boolean().optional(),
			creator: z
				.object({
					id: z.string(),
					name: z.string(),
					type: z.enum(['human', 'agent']).optional(),
				})
				.optional(),
			assignee: z
				.object({
					id: z.string(),
					name: z.string(),
					type: z.enum(['human', 'agent']).optional(),
				})
				.optional(),
			project: z
				.object({
					id: z.string(),
					name: z.string(),
				})
				.optional(),
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
	done: tui.colorInfo,
	cancelled: tui.muted,
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

const VALID_INCLUDE_FIELDS = new Set<TaskIncludeField>([
	'description',
	'metadata',
	'tags',
	'subtask_count',
	'created_id',
	'deleted',
]);

function parseIncludeParam(include: string | undefined): TaskIncludeField[] | undefined {
	if (!include) return undefined;
	const fields: TaskIncludeField[] = [];
	for (const f of include.split(',')) {
		const trimmed = f.trim() as TaskIncludeField;
		if (VALID_INCLUDE_FIELDS.has(trimmed)) {
			fields.push(trimmed);
		} else {
			tui.fatal(
				`Invalid include field: "${trimmed}". Valid fields are: ${[...VALID_INCLUDE_FIELDS].join(', ')}`
			);
		}
	}
	return fields.length > 0 ? fields : undefined;
}

function hasIncludeField(
	include: TaskIncludeField[] | undefined,
	field: TaskIncludeField
): boolean {
	return include?.includes(field) ?? false;
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
		{
			command: getCommand('cloud task list --created-id me --include description,metadata,tags'),
			description: 'List tasks created by me with full details',
		},
		{
			command: getCommand('cloud task list --project-id proj_abc123'),
			description: 'List tasks for a specific project',
		},
	],
	schema: {
		options: z.object({
			status: z
				.enum(['open', 'in_progress', 'started', 'done', 'completed', 'closed', 'cancelled'])
				.optional()
				.describe('filter by status'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.optional()
				.describe('filter by type'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('filter by priority'),
			assignedId: z
				.string()
				.optional()
				.describe('filter by assigned agent or user ID (use "me" for current user)'),
			createdId: z
				.string()
				.optional()
				.describe('filter by creator ID (use "me" for current user)'),
			parentId: z.string().optional().describe('filter by parent task ID'),
			projectId: z.string().optional().describe('filter by project ID'),
			tagId: z.string().optional().describe('filter by tag ID'),
			deleted: z.boolean().optional().describe('include soft-deleted tasks'),
			include: z
				.string()
				.optional()
				.describe(
					'comma-separated fields to include: description,metadata,tags,subtask_count,created_id,deleted'
				),
			sort: z
				.enum(['created_at', 'updated_at', 'priority'])
				.optional()
				.describe('field to sort by (default: created_at)'),
			order: z.enum(['asc', 'desc']).optional().describe('sort order (default: desc)'),
			limit: z.coerce.number().optional().describe('max results to return (default: 50)'),
			offset: z.coerce.number().optional().describe('offset for pagination'),
			orgId: z.string().optional().describe('organization ID (uses default if not specified)'),
		}),
		response: TaskListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const createdId = resolveMeId(opts.createdId, ctx);
		const assignedId = resolveMeId(opts.assignedId, ctx);

		const includeFields = parseIncludeParam(opts.include);

		const result = await storage.list({
			status: opts.status as TaskStatus | undefined,
			type: opts.type as TaskType | undefined,
			priority: opts.priority as TaskPriority | undefined,
			assigned_id: assignedId,
			created_id: createdId,
			parent_id: opts.parentId,
			project_id: opts.projectId,
			tag_id: opts.tagId,
			deleted: opts.deleted,
			include: includeFields,
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
				const showDescription = hasIncludeField(includeFields, 'description');
				const showTags = hasIncludeField(includeFields, 'tags');

				const tableData = result.tasks.map((task: Task) => ({
					ID: tui.muted(truncate(task.id, 28)),
					Title: truncate(task.title, 40),
					Type: task.type,
					Status: formatStatus(task.status),
					Priority: formatPriority(task.priority),
					Creator: task.creator?.name ? truncate(task.creator.name, 20) : tui.muted('—'),
					Assigned: task.assignee?.name ? truncate(task.assignee.name, 20) : tui.muted('—'),
					Updated: new Date(task.updated_at).toLocaleDateString(),
				}));

				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Title', alignment: 'left' },
					{ name: 'Type', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
					{ name: 'Priority', alignment: 'left' },
					{ name: 'Creator', alignment: 'left' },
					{ name: 'Assigned', alignment: 'left' },
					{ name: 'Updated', alignment: 'left' },
				]);

				// Show extra details for each task if included
				if (showDescription || showTags) {
					for (const task of result.tasks) {
						const extras: string[] = [];
						if (showDescription && task.description) {
							extras.push(`${tui.muted('Desc:')} ${truncate(task.description, 80)}`);
						}
						if (showTags && task.tags && task.tags.length > 0) {
							const tagList = task.tags.map((t) => t.name).join(', ');
							extras.push(`${tui.muted('Tags:')} ${tagList}`);
						}
						if (extras.length > 0) {
							tui.output(`  ${tui.muted(truncate(task.id, 28))} → ${extras.join(' | ')}`);
						}
					}
				}

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
				description: task.description,
				metadata: task.metadata,
				tags: task.tags,
				subtask_count: task.subtask_count,
				created_id: task.created_id,
				creator: task.creator,
				assignee: task.assignee,
				project: task.project,
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
