import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';
import type { TaskPriority, TaskStatus, TaskType, BatchDeletedTask } from '@agentuity/core';

const DURATION_UNITS: Record<string, number> = {
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse a human-friendly duration string (e.g. "30s", "7d", "24h", "30m", "2w")
 * into milliseconds. Exported for testing.
 */
export function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([smhdw])$/);
	if (!match) {
		tui.fatal(
			`Invalid duration format: "${duration}". Use a number followed by s (seconds), m (minutes), h (hours), d (days), or w (weeks). Examples: 30s, 30m, 24h, 7d, 2w`
		);
		// tui.fatal exits, but TypeScript doesn't know that
		throw new Error('unreachable');
	}
	const value = parseInt(match[1]!, 10);
	const unit = match[2]!;
	const ms = DURATION_UNITS[unit];
	if (!ms) {
		tui.fatal(`Unknown duration unit: "${unit}"`);
		throw new Error('unreachable');
	}
	return value * ms;
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

const TaskDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	deleted: z
		.array(
			z.object({
				id: z.string().describe('Deleted task ID'),
				title: z.string().describe('Deleted task title'),
			})
		)
		.describe('List of deleted tasks'),
	count: z.number().describe('Number of tasks deleted'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	dryRun: z.boolean().optional().describe('Whether this was a dry run'),
	message: z.string().optional().describe('Status message'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm'],
	description: 'Soft-delete a task by ID or batch-delete tasks by filter',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task delete task_abc123'),
			description: 'Delete a single task by ID',
		},
		{
			command: getCommand('cloud task delete --status done --older-than 7d'),
			description: 'Delete done tasks older than 7 days',
		},
		{
			command: getCommand('cloud task delete --status done --limit 10 --dry-run'),
			description: 'Preview which done tasks would be deleted (dry run)',
		},
		{
			command: getCommand('cloud task delete --status cancelled --confirm'),
			description: 'Delete all cancelled tasks without confirmation prompt',
		},
	],
	schema: {
		args: z.object({
			id: z.string().optional().describe('Task ID to delete (for single delete)'),
		}),
		options: z.object({
			status: z
				.enum(['open', 'in_progress', 'done', 'cancelled'])
				.optional()
				.describe('filter batch delete by status'),
			type: z
				.enum(['epic', 'feature', 'enhancement', 'bug', 'task'])
				.optional()
				.describe('filter batch delete by type'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('filter batch delete by priority'),
			olderThan: z
				.string()
				.optional()
				.describe('filter batch delete by age (e.g. 30s, 7d, 24h, 2w)'),
			parentId: z.string().optional().describe('filter batch delete by parent task ID'),
			createdId: z.string().optional().describe('filter batch delete by creator ID'),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(200)
				.default(50)
				.describe('max tasks to delete in batch mode (default: 50, max: 200)'),
			confirm: z.boolean().optional().default(false).describe('skip confirmation prompt'),
		}),
		response: TaskDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		// Determine mode: single delete or batch delete
		const isSingleDelete = !!args.id;
		const hasFilters =
			opts.status ||
			opts.type ||
			opts.priority ||
			opts.olderThan ||
			opts.parentId ||
			opts.createdId;

		if (!isSingleDelete && !hasFilters) {
			tui.fatal(
				'Provide a task ID for single delete, or use --status, --type, --priority, --older-than, --parent-id, or --created-id for batch delete.'
			);
		}

		if (isSingleDelete && hasFilters) {
			tui.fatal(
				'Cannot combine task ID with filter options. Use either single delete (by ID) or batch delete (by filters).'
			);
		}

		// ── Single delete mode ──────────────────────────────────────────────
		if (isSingleDelete) {
			if (isDryRunMode(options)) {
				outputDryRun(`Would soft-delete task: ${args.id}`, options);
				return {
					success: true,
					deleted: [{ id: args.id!, title: '(dry run)' }],
					count: 1,
					durationMs: Date.now() - started,
					dryRun: true,
					message: 'Dry run — no tasks were deleted',
				};
			}

			if (!opts.confirm) {
				const confirmed = await tui.confirm(`Delete task "${args.id}"?`, false);
				if (!confirmed) {
					if (!options.json) tui.info('Cancelled');
					return {
						success: false,
						deleted: [],
						count: 0,
						durationMs: Date.now() - started,
						message: 'Cancelled',
					};
				}
			}

			const task = await storage.softDelete(args.id!);
			const durationMs = Date.now() - started;

			if (!options.json) {
				tui.success(`Deleted task ${tui.bold(task.id)} (${task.title}) in ${durationMs}ms`);
			}

			return {
				success: true,
				deleted: [{ id: task.id, title: task.title }],
				count: 1,
				durationMs,
			};
		}

		// ── Batch delete mode ───────────────────────────────────────────────
		// Validate older-than format early (before calling the API)
		if (opts.olderThan) {
			parseDuration(opts.olderThan); // will fatal on invalid format
		}

		const batchParams = {
			status: opts.status as TaskStatus | undefined,
			type: opts.type as TaskType | undefined,
			priority: opts.priority as TaskPriority | undefined,
			parent_id: opts.parentId,
			created_id: opts.createdId,
			older_than: opts.olderThan,
			limit: opts.limit,
		};

		// For dry-run and preview, first list what would be matched
		// (we call batchDelete only when actually executing)
		if (isDryRunMode(options) || !opts.confirm) {
			// Use list() to preview matching tasks
			const preview = await storage.list({
				status: batchParams.status,
				type: batchParams.type,
				priority: batchParams.priority,
				parent_id: batchParams.parent_id,
				limit: batchParams.limit,
				sort: 'created_at',
				order: 'asc',
			});

			// Client-side filters for preview (server will apply these on actual delete)
			let candidates = preview.tasks;
			if (batchParams.created_id) {
				candidates = candidates.filter(
					(t: { created_id: string }) => t.created_id === batchParams.created_id
				);
			}
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
					deleted: [],
					count: 0,
					durationMs: Date.now() - started,
					message: 'No matching tasks found',
				};
			}

			// Show preview table
			if (!options.json) {
				tui.warning(
					`Found ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')} to delete:`
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
					`Would soft-delete ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')}`,
					options
				);
				return {
					success: true,
					deleted: candidates.map(
						(t: { id: string; title: string }): BatchDeletedTask => ({
							id: t.id,
							title: t.title,
						})
					),
					count: candidates.length,
					durationMs: Date.now() - started,
					dryRun: true,
					message: 'Dry run — no tasks were deleted',
				};
			}

			// Confirmation prompt
			if (!opts.confirm) {
				const confirmed = await tui.confirm(
					`Delete ${candidates.length} ${tui.plural(candidates.length, 'task', 'tasks')}?`,
					false
				);
				if (!confirmed) {
					if (!options.json) tui.info('Cancelled');
					return {
						success: false,
						deleted: [],
						count: 0,
						durationMs: Date.now() - started,
						message: 'Cancelled',
					};
				}
			}
		}

		// Execute batch delete via server-side API
		const result = await storage.batchDelete(batchParams);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.count > 0) {
				tui.success(
					`Deleted ${result.count} ${tui.plural(result.count, 'task', 'tasks')} in ${durationMs}ms`
				);
			} else {
				tui.info('No tasks matched the given filters');
			}
		}

		return {
			success: true,
			deleted: result.deleted,
			count: result.count,
			durationMs,
		};
	},
});

export default deleteSubcommand;
