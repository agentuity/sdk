import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const KVStatsPaginatedSchema = z
	.object({
		total: z.number().describe('Total number of namespaces across all pages'),
		limit: z.number().describe('Number of namespaces requested per page'),
		offset: z.number().describe('Number of namespaces skipped'),
		hasMore: z.boolean().describe('Whether there are more namespaces available'),
	})
	.passthrough();

const KVStatsResponseSchema = z.union([
	z.object({
		namespace: z.string().describe('Namespace name'),
		count: z.number().describe('Number of keys'),
		sum: z.number().describe('Total size in bytes'),
		createdAt: z.string().optional().describe('Creation timestamp'),
		lastUsedAt: z.string().optional().describe('Last used timestamp'),
	}),
	z.record(
		z.string(),
		z.object({
			count: z.number().describe('Number of keys'),
			sum: z.number().describe('Total size in bytes'),
			createdAt: z.string().optional().describe('Creation timestamp'),
			lastUsedAt: z.string().optional().describe('Last used timestamp'),
		})
	),
	KVStatsPaginatedSchema,
]);

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'Get statistics for keyvalue storage',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud kv stats'), description: 'Show stats for all namespaces' },
		{
			command: getCommand('cloud kv stats production'),
			description: 'Show stats for production namespace',
		},
		{
			command: getCommand('cloud kv stats cache'),
			description: 'Show stats for cache namespace',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('the keyvalue namespace'),
		}),
		options: z.object({
			name: z.string().optional().describe('Filter namespaces by name'),
			sort: z
				.enum(['name', 'size', 'records', 'created', 'lastUsed'])
				.default('name')
				.describe('field to sort by'),
			direction: z.enum(['asc', 'desc']).default('asc').describe('sort direction'),
			limit: z.coerce.number().min(0).optional().describe('Maximum number of results to return'),
			offset: z.coerce.number().min(0).optional().describe('Offset for pagination'),
			projectId: z.string().optional().describe('Filter by project ID'),
			agentId: z.string().optional().describe('Filter by agent ID'),
			projectName: z.string().optional().describe('Filter by project name'),
			agentName: z.string().optional().describe('Filter by agent name'),
		}),
		response: KVStatsResponseSchema,
	},
	webUrl: (ctx) =>
		ctx.args.name ? `/services/kv/${encodeURIComponent(ctx.args.name)}` : '/services/kv',

	async handler(ctx) {
		const { args, options, opts } = ctx;
		const kv = await createStorageAdapter(ctx);

		if (args.name) {
			const stats = await kv.getStats(args.name);

			if (!options.json) {
				tui.info(`Statistics for ${tui.bold(args.name)}:`);
				tui.info(`  Keys: ${stats.count}`);
				const sizeDisplay =
					stats.sum < 1024 * 1024
						? `${stats.sum.toLocaleString()} bytes`
						: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
				tui.info(`  Total size: ${sizeDisplay} (raw: ${stats.sum})`);
				if (stats.createdAt) {
					tui.info(`  Created: ${new Date(stats.createdAt).toLocaleString()}`);
				}
				if (stats.lastUsedAt) {
					tui.info(`  Last used: ${new Date(stats.lastUsedAt).toLocaleString()}`);
				}
			}

			return {
				namespace: args.name,
				count: stats.count,
				sum: stats.sum,
				createdAt: stats.createdAt ? String(stats.createdAt) : undefined,
				lastUsedAt: stats.lastUsedAt ? String(stats.lastUsedAt) : undefined,
			};
		} else {
			const allStats = await kv.getAllStats({
				...(opts?.name && { name: opts.name }),
				...(opts?.sort && { sort: opts.sort }),
				...(opts?.direction && { direction: opts.direction }),
				...(opts?.limit !== undefined && { limit: opts.limit }),
				...(opts?.offset !== undefined && { offset: opts.offset }),
				...(opts?.projectId && { projectId: opts.projectId }),
				...(opts?.agentId && { agentId: opts.agentId }),
				...(opts?.projectName && { projectName: opts.projectName }),
				...(opts?.agentName && { agentName: opts.agentName }),
			});

			// Handle both paginated and flat response formats.
			// Strictly validate pagination shape to avoid misclassifying a flat response
			// that happens to contain a namespace literally named "namespaces".
			const isPaginated =
				allStats != null &&
				typeof allStats === 'object' &&
				'namespaces' in allStats &&
				'total' in allStats &&
				typeof (allStats as Record<string, unknown>).total === 'number' &&
				typeof (allStats as Record<string, unknown>).namespaces === 'object' &&
				(allStats as Record<string, unknown>).namespaces != null &&
				// A paginated namespaces value is a Record of namespace entries (each with count/sum),
				// not itself a single namespace entry (which would have count/sum at the top level).
				!('count' in ((allStats as Record<string, unknown>).namespaces as object));
			const namespaceMap = isPaginated
				? (
						allStats as {
							namespaces: Record<
								string,
								{ count: number; sum: number; createdAt?: string; lastUsedAt?: string }
							>;
						}
					).namespaces
				: (allStats as Record<
						string,
						{ count: number; sum: number; createdAt?: string; lastUsedAt?: string }
					>);
			const entries = Object.entries(namespaceMap);

			if (!options.json) {
				if (entries.length === 0) {
					tui.info('No namespaces found');
				} else {
					const totalInfo = isPaginated
						? ` (showing ${entries.length} of ${(allStats as { total: number }).total})`
						: '';
					tui.info(
						`Found ${entries.length} ${tui.plural(entries.length, 'namespace', 'namespaces')}${totalInfo}:`
					);
					for (const [name, stats] of entries) {
						const sizeDisplay =
							stats.sum < 1024 * 1024
								? `${stats.sum.toLocaleString()} bytes`
								: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
						tui.arrow(
							`${tui.bold(name.padEnd(15, ' '))}: ${stats.count} keys, ${sizeDisplay}`
						);
					}
				}
			}

			// For JSON output with pagination, include metadata
			if (isPaginated) {
				const paginatedResult = allStats as {
					namespaces: Record<
						string,
						{ count: number; sum: number; createdAt?: string; lastUsedAt?: string }
					>;
					total: number;
					limit: number;
					offset: number;
					hasMore: boolean;
				};
				// Convert timestamps to strings in namespaces
				const namespaces: Record<
					string,
					{ count: number; sum: number; createdAt?: string; lastUsedAt?: string }
				> = {};
				for (const [name, stats] of entries) {
					namespaces[name] = {
						count: stats.count,
						sum: stats.sum,
						createdAt: stats.createdAt ? String(stats.createdAt) : undefined,
						lastUsedAt: stats.lastUsedAt ? String(stats.lastUsedAt) : undefined,
					};
				}
				return {
					namespaces,
					total: paginatedResult.total,
					limit: paginatedResult.limit,
					offset: paginatedResult.offset,
					hasMore: paginatedResult.hasMore,
				};
			}

			// Non-paginated: return flat map
			const result: Record<
				string,
				{ count: number; sum: number; createdAt?: string; lastUsedAt?: string }
			> = {};
			for (const [name, stats] of entries) {
				result[name] = {
					count: stats.count,
					sum: stats.sum,
					createdAt: stats.createdAt ? String(stats.createdAt) : undefined,
					lastUsedAt: stats.lastUsedAt ? String(stats.lastUsedAt) : undefined,
				};
			}
			return result;
		}
	},
});

export default statsSubcommand;
