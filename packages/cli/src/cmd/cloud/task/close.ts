import { readFile } from 'node:fs/promises';
import type { BatchClosedTask, TaskPriority, TaskStatus, TaskType } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { isDryRunMode, outputDryRun } from '../../../explain.ts';
import { pathExists } from '../../../node-compat/fs.ts';
import * as tui from '../../../tui.ts';
import { createCommand } from '../../../types.ts';
import { createStorageAdapter, parseDuration, resolveMeId, truncate } from './util.ts';

const TaskCloseResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	closed: z
		.array(
			z.object({
				id: z.string().describe('Closed task ID'),
				title: z.string().describe('Closed task title'),
				status: z.string().describe('Task status'),
				closed_date: z.string().optional().describe('ISO 8601 closed date'),
			})
		)
		.describe('List of closed tasks'),
	count: z.number().describe('Number of tasks closed'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	dryRun: z.boolean().optional().describe('Whether this was a dry run'),
	message: z.string().optional().describe('Status message'),
});

export const closeSubcommand = createCommand({
	name: 'close',
	aliases: ['done', 'complete'],
	description: 'Close a task by ID or batch-close tasks by filter',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task close task_abc123'),
			description: 'Close a single task by ID',
		},
		{
			command: getCommand('cloud task close --status in_progress --older-than 7d'),
			description: 'Close in-progress tasks older than 7 days',
		},
		{
			command: getCommand('cloud task close --status open --limit 10 --dry-run'),
			description: 'Preview which open tasks would be closed (dry run)',
		},
		{
			command: getCommand('cloud task close --created-id me --confirm'),
			description: 'Close all tasks created by me without confirmation prompt',
		},
	],
	schema: {
		args: z.object({
			id: z.string().optional().describe('Task ID to close (for single close)'),
		}),
		options: z.object({
			status: z
				.enum(['open', 'in_progress', 'started', 'done', 'completed', 'closed', 'cancelled'])
				.optional()
				.describe('filter batch close by status'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.optional()
				.describe('filter batch close by type'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('filter batch close by priority'),
			olderThan: z
				.string()
				.optional()
				.describe('filter batch close by age (e.g. 30s, 7d, 24h, 2w)'),
			parentId: z.string().optional().describe('filter batch close by parent task ID'),
			createdId: z
				.string()
				.optional()
				.describe('filter batch close by creator ID (use "me" for current user)'),
			assignedId: z.string().optional().describe('filter batch close by assigned user ID'),
			projectId: z.string().optional().describe('filter batch close by project ID'),
			tagId: z.string().optional().describe('filter batch close by tag ID'),
			idsFile: z.string().optional().describe('path to JSON file containing task IDs to close'),
			orgId: z.string().optional().describe('organization ID (uses default if not specified)'),
			dryRun: z
				.boolean()
				.optional()
				.default(false)
				.describe('preview changes without executing'),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(200)
				.default(50)
				.describe('max tasks to close in batch mode (default: 50, max: 200)'),
			confirm: z.boolean().optional().default(false).describe('skip confirmation prompt'),
		}),
		response: TaskCloseResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const isSingleClose = !!args.id;
		const hasFilters =
			opts.status ||
			opts.type ||
			opts.priority ||
			opts.olderThan ||
			opts.parentId ||
			opts.createdId ||
			opts.assignedId ||
			opts.projectId ||
			opts.tagId ||
			opts.idsFile;

		if (!isSingleClose && !hasFilters) {
			tui.fatal(
				'Provide a task ID for single close, or use --status, --type, --priority, --older-than, --parent-id, --created-id, --assigned-id, --project-id, --tag-id, or --ids-file for batch close.'
			);
		}

		if (isSingleClose && hasFilters) {
			tui.fatal(
				'Cannot combine task ID with filter options. Use either single close (by ID) or batch close (by filters).'
			);
		}

		if (isSingleClose) {
			if (isDryRunMode(options)) {
				outputDryRun(`Would close task: ${args.id}`, options);
				return {
					success: true,
					closed: [{ id: args.id!, title: '(dry run)', status: 'done' }],
					count: 1,
					durationMs: Date.now() - started,
					dryRun: true,
					message: 'Dry run — no tasks were closed',
				};
			}

			if (!opts.confirm) {
				const confirmed = await tui.confirm(`Close task "${args.id}"?`, false);
				if (!confirmed) {
					if (!options.json) tui.info('Cancelled');
					return {
						success: false,
						closed: [],
						count: 0,
						durationMs: Date.now() - started,
						message: 'Cancelled',
					};
				}
			}

			const task = await storage.close(args.id!);
			const durationMs = Date.now() - started;

			if (!options.json) {
				tui.success(`Closed task ${tui.bold(task.id)} (${task.title}) in ${durationMs}ms`);
			}

			return {
				success: true,
				closed: [
					{
						id: task.id,
						title: task.title,
						status: task.status,
						closed_date: task.closed_date,
					},
				],
				count: 1,
				durationMs,
			};
		}

		// Batch close mode
		if (opts.olderThan) {
			parseDuration(opts.olderThan);
		}

		const createdId = resolveMeId(opts.createdId, ctx);
		const assignedId = resolveMeId(opts.assignedId, ctx);

		// Handle IDs file
		let explicitIds: string[] | undefined;
		if (opts.idsFile) {
			if (!(await pathExists(opts.idsFile))) {
				tui.fatal(`IDs file not found: ${opts.idsFile}`);
			}
			try {
				const content = JSON.parse(await readFile(opts.idsFile, 'utf-8'));
				if (Array.isArray(content)) {
					explicitIds = content.map((id) => String(id));
				} else if (content && Array.isArray((content as { ids?: string[] }).ids)) {
					explicitIds = (content as { ids: string[] }).ids;
				} else {
					tui.fatal(`Invalid IDs file format. Expected array of IDs or { ids: [...] }`);
				}
			} catch (err) {
				tui.fatal(`Failed to parse IDs file: ${err}`);
			}
		}

		const batchParams = {
			status: opts.status as TaskStatus | undefined,
			type: opts.type as TaskType | undefined,
			priority: opts.priority as TaskPriority | undefined,
			parent_id: opts.parentId,
			created_id: createdId,
			assigned_id: assignedId,
			project_id: opts.projectId,
			tag_id: opts.tagId,
			older_than: opts.olderThan,
			ids: explicitIds,
			limit: opts.limit,
			closed_id: ctx.auth.userId,
			dry_run: isDryRunMode(options),
		};

		// For confirmation, run a dry-run first to preview
		if (!isDryRunMode(options) && !opts.confirm) {
			const preview = await storage.batchClose({ ...batchParams, dry_run: true });

			if (preview.count === 0) {
				if (!options.json) tui.info('No tasks match the given filters');
				return {
					success: true,
					closed: [],
					count: 0,
					durationMs: Date.now() - started,
					message: 'No matching tasks found',
				};
			}

			if (!options.json) {
				tui.warning(
					`Found ${preview.count} ${tui.plural(preview.count, 'task', 'tasks')} to close:`
				);
				tui.newline();

				const tableData = preview.closed.map((task: BatchClosedTask) => ({
					ID: tui.muted(truncate(task.id, 28)),
					Title: truncate(task.title, 40),
					Status: task.status,
				}));

				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Title', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
				]);
				tui.newline();
			}

			const confirmed = await tui.confirm(
				`Close ${preview.count} ${tui.plural(preview.count, 'task', 'tasks')}?`,
				false
			);
			if (!confirmed) {
				if (!options.json) tui.info('Cancelled');
				return {
					success: false,
					closed: [],
					count: 0,
					durationMs: Date.now() - started,
					message: 'Cancelled',
				};
			}
		}

		// Execute batch close
		const result = await storage.batchClose(batchParams);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.dry_run) {
				if (result.count > 0) {
					tui.info(
						`Dry run: would close ${result.count} ${tui.plural(result.count, 'task', 'tasks')}`
					);
				} else {
					tui.info('No tasks match the given filters');
				}
			} else if (result.count > 0) {
				tui.success(
					`Closed ${result.count} ${tui.plural(result.count, 'task', 'tasks')} in ${durationMs}ms`
				);

				// Show which tasks were closed
				if (result.closed.length > 0) {
					tui.newline();
					const closedTable = result.closed.map((task) => ({
						ID: tui.muted(truncate(task.id, 28)),
						Title: truncate(task.title, 40),
					}));
					tui.table(closedTable, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'Title', alignment: 'left' },
					]);
				}
			} else {
				tui.info('No tasks matched the given filters');
			}
		}

		return {
			success: true,
			closed: result.closed,
			count: result.count,
			durationMs,
			dryRun: result.dry_run,
		};
	},
});

export default closeSubcommand;
