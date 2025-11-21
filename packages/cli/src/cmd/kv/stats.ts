import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

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
]);

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'Get statistics for keyvalue storage',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('kv stats')} - Show stats for all namespaces`,
		`${getCommand('kv stats production')} - Show stats for production namespace`,
		`${getCommand('kv stats cache')} - Show stats for cache namespace`,
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('the keyvalue namespace'),
		}),
		response: KVStatsResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		if (args.name) {
			const stats = await kv.getStats(args.name);
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

			return {
				namespace: args.name,
				count: stats.count,
				sum: stats.sum,
				createdAt: stats.createdAt,
				lastUsedAt: stats.lastUsedAt,
			};
		} else {
			const allStats = await kv.getAllStats();
			const entries = Object.entries(allStats);

			if (entries.length === 0) {
				tui.info('No namespaces found');
				return {};
			}

			tui.info(
				`Found ${entries.length} ${tui.plural(entries.length, 'namespace', 'namespaces')}:`
			);
			for (const [name, stats] of entries) {
				const sizeDisplay =
					stats.sum < 1024 * 1024
						? `${stats.sum.toLocaleString()} bytes`
						: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
				tui.arrow(`${tui.bold(name.padEnd(15, ' '))}: ${stats.count} keys, ${sizeDisplay}`);
			}

			return allStats;
		}
	},
});

export default statsSubcommand;
