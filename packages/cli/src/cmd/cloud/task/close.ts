import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter, resolveUserIdOrMe } from './util';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import { parseDuration } from './delete';
import type { TaskPriority, TaskStatus, TaskType } from '@agentuity/core';

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}\u2026`;
}

const TaskCloseResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	closed: z
		.array(
			z.object({
				id: z.string().describe('Closed task ID'),
				title: z.string().describe('Closed task title'),
			})
		)
		.describe('List of closed tasks'),
	errors: z
		.array(
			z.object({
				id: z.string().describe('Task ID that failed to close'),
				error: z.string().describe('Failure reason'),
			})
		)
		.optional()
		.describe('Per-task failures'),
	count: z.number().describe('Number of tasks closed'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	dryRun: z.boolean().optional().describe('Whether this was a dry run'),
	message: z.string().optional().describe('Status message'),
});

export const closeSubcommand = createCommand({
	name: 'close',
	aliases: ['done', 'resolve'],
	description: 'Close a task by ID or batch-close tasks by filter (sets status to done)',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task close task_abc123'),
			description: 'Close a single task by ID',
		},
		{
			command: getCommand('cloud task close --created-id me --status open --dry-run'),
			description: 'Preview which of your open tasks would be closed',
		},
		{
			command: getCommand('cloud task close --status open --older-than 7d --confirm'),
			description: 'Close all open tasks older than 7 days without prompting',
		},
		{
			command: getCommand('cloud task close --ids-file /tmp/task-close-manifest.json'),
			description: 'Close tasks listed in a JSON file (array of task IDs)',
		},
		{
			command: getCommand(
				'cloud task close --created-id me --type bug --closed-id me --dry-run'
			),
			description: 'Dry-run closing all your bug tasks',
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
				.describe('filter batch close by creator ID (use "me" for the authenticated user)'),
			projectId: z.string().optional().describe('filter batch close by project ID'),
			tagId: z.string().optional().describe('filter batch close by tag ID'),
			closedId: z
				.string()
				.optional()
				.describe('ID of the closer to record (use "me" for the authenticated user)'),
			idsFile: z
				.string()
				.optional()
				.describe('path to a JSON file containing an array of task IDs to close'),
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

		const createdId = resolveUserIdOrMe(opts.createdId, ctx);
		const closedId = resolveUserIdOrMe(opts.closedId, ctx);

		// ── IDs-file mode ──────────────────────────────────────────────────
		if (opts.idsFile) {
			if (args.id) {
				tui.fatal('Cannot combine task ID argument with --ids-file.');
			}
			if (
				opts.status ||
				opts.type ||
				opts.priority ||
				opts.olderThan ||
				opts.parentId ||
				createdId ||
				opts.projectId ||
				opts.tagId
			) {
				tui.fatal(
					'Cannot combine --ids-file with filter options. Use either --ids-file or batch filters.'
				);
			}
			const file = Bun.file(opts.idsFile);
			if (!(await file.exists())) {
				tui.fatal(`File not found: ${opts.idsFile}`);
			}
			let ids: string[];
			try {
				const content = await file.json();
				if (!Array.isArray(content) || !content.every((v) => typeof v === 'string')) {
					tui.fatal(
						'--ids-file must contain a JSON array of task ID strings, e.g. ["task_abc","task_def"]'
					);
				}
				ids = content as string[];
			} catch {
				tui.fatal(
					'Failed to parse --ids-file as JSON. Expected a JSON array of task ID strings.'
				);
			}

			if (ids.length === 0) {
				if (!options.json) tui.info('No task IDs in file');
				return {
					success: true,
					closed: [],
					count: 0,
					durationMs: Date.now() - started,
					message: 'No task IDs provided',
				};
			}

			if (isDryRunMode(options)) {
				outputDryRun(
					`Would close ${ids.length} ${tui.plural(ids.length, 'task', 'tasks')} from file`,
					options
				);
				return {
					success: true,
					closed: ids.map((id) => ({ id, title: '(dry run)' })),
					count: ids.length,
					durationMs: Date.now() - started,
					dryRun: true,
					message: 'Dry run \u2014 no tasks were closed',
				};
			}

			if (!opts.confirm) {
				const confirmed = await tui.confirm(
					`Close ${ids.length} ${tui.plural(ids.length, 'task', 'tasks')} from file?`,
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

			const closed: { id: string; title: string }[] = [];
			const errors: { id: string; error: string }[] = [];

			for (const id of ids) {
				try {
					const task = await storage.close(id);
					if (closedId) {
						await storage.update(task.id, { closed_id: closedId });
					}
					closed.push({ id: task.id, title: task.title });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					errors.push({ id, error: msg });
					if (!options.json) {
						tui.warn(`Failed to close ${id}: ${msg}`);
					}
				}
			}

			const durationMs = Date.now() - started;

			if (!options.json) {
				if (closed.length > 0) {
					tui.success(
						`Closed ${closed.length} ${tui.plural(closed.length, 'task', 'tasks')} in ${durationMs}ms`
					);
				}
				if (errors.length > 0) {
					tui.warn(
						`${errors.length} ${tui.plural(errors.length, 'task', 'tasks')} failed to close`
					);
				}
			}

			return {
				success: errors.length === 0,
				closed,
				errors: errors.length > 0 ? errors : undefined,
				count: closed.length,
				durationMs,
			};
		}

		// ── Single close mode ──────────────────────────────────────────────
		const isSingleClose = !!args.id;
		const hasFilters =
			opts.status ||
			opts.type ||
			opts.priority ||
			opts.olderThan ||
			opts.parentId ||
			createdId ||
			opts.projectId ||
			opts.tagId;

		if (!isSingleClose && !hasFilters) {
			tui.fatal(
				'Provide a task ID for single close, or use filters (--status, --type, --priority, --older-than, --created-id, --project-id, --tag-id) for batch close.'
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
					closed: [{ id: args.id!, title: '(dry run)' }],
					count: 1,
					durationMs: Date.now() - started,
					dryRun: true,
					message: 'Dry run \u2014 no tasks were closed',
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
			if (closedId) {
				await storage.update(task.id, { closed_id: closedId });
			}
			const durationMs = Date.now() - started;

			if (!options.json) {
				tui.success(`Closed task ${tui.bold(task.id)} (${task.title}) in ${durationMs}ms`);
			}

			return {
				success: true,
				closed: [{ id: task.id, title: task.title }],
				count: 1,
				durationMs,
			};
		}

		// ── Batch close mode ───────────────────────────────────────────────
		if (opts.olderThan) {
			parseDuration(opts.olderThan);
		}

		// Preview matching tasks using list()
		const preview = await storage.list({
			status: opts.status as TaskStatus | undefined,
			type: opts.type as TaskType | undefined,
			priority: opts.priority as TaskPriority | undefined,
			parent_id: opts.parentId,
			created_id: createdId,
			project_id: opts.projectId,
			tag_id: opts.tagId,
			limit: opts.limit,
			sort: 'created_at',
			order: 'asc',
		});

		// Client-side age filter for preview
		let candidates = preview.tasks;
		if (opts.olderThan) {
			const durationMs = parseDuration(opts.olderThan);
			const cutoff = new Date(Date.now() - durationMs);
			candidates = candidates.filter(
				(t: { created_at: string }) => new Date(t.created_at) < cutoff
			);
		}

		if (candidates.length === 0) {
			if (!options.json) tui.info('No tasks match the given filters');
			return {
				success: true,
				closed: [],
				count: 0,
				durationMs: Date.now() - started,
				message: 'No matching tasks found',
			};
		}

		// Show preview table
		if (!options.json) {
			tui.warning(
				`Found ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')} to close:`
			);
			tui.newline();

			const tableData = candidates.map(
				(task: {
					id: string;
					title: string;
					status: string;
					type: string;
					created_at: string;
				}) => ({
					ID: tui.muted(truncate(task.id, 28)),
					Title: truncate(task.title, 40),
					Status: task.status,
					Type: task.type,
					Created: new Date(task.created_at).toLocaleDateString(),
				})
			);

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Title', alignment: 'left' },
				{ name: 'Status', alignment: 'left' },
				{ name: 'Type', alignment: 'left' },
				{ name: 'Created', alignment: 'left' },
			]);
			tui.newline();
		}

		// Dry-run: return preview without executing
		if (isDryRunMode(options)) {
			outputDryRun(
				`Would close ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')}`,
				options
			);
			return {
				success: true,
				closed: candidates.map((t: { id: string; title: string }) => ({
					id: t.id,
					title: t.title,
				})),
				count: candidates.length,
				durationMs: Date.now() - started,
				dryRun: true,
				message: 'Dry run \u2014 no tasks were closed',
			};
		}

		// Confirmation prompt
		if (!opts.confirm) {
			const confirmed = await tui.confirm(
				`Close ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')}?`,
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
		const closed: { id: string; title: string }[] = [];
		const errors: { id: string; error: string }[] = [];

		for (const candidate of candidates) {
			try {
				const task = await storage.close(candidate.id);
				if (closedId) {
					await storage.update(task.id, { closed_id: closedId });
				}
				closed.push({ id: task.id, title: task.title });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				errors.push({ id: candidate.id, error: msg });
				if (!options.json) {
					tui.warn(`Failed to close ${candidate.id}: ${msg}`);
				}
			}
		}

		const durationMs = Date.now() - started;

		if (!options.json) {
			if (closed.length > 0) {
				tui.success(
					`Closed ${closed.length} ${tui.plural(closed.length, 'task', 'tasks')} in ${durationMs}ms`
				);
			}
			if (errors.length > 0) {
				tui.warn(
					`${errors.length} ${tui.plural(errors.length, 'task', 'tasks')} failed to close`
				);
			}
		}

		return {
			success: errors.length === 0,
			closed,
			errors: errors.length > 0 ? errors : undefined,
			count: closed.length,
			durationMs,
		};
	},
});

export default closeSubcommand;
