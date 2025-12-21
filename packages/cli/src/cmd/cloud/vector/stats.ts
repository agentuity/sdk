import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const VectorItemStatsSchema = z.object({
	embedding: z.array(z.number()).optional().describe('The embedding vector'),
	document: z.string().optional().describe('Original document text'),
	size: z.number().describe('Size in bytes'),
	metadata: z.record(z.string(), z.unknown()).optional().describe('Metadata'),
	firstUsed: z.number().describe('First access timestamp (ms)'),
	lastUsed: z.number().describe('Last access timestamp (ms)'),
	count: z.number().describe('Access count'),
});

const VectorNamespaceStatsSchema = z.object({
	sum: z.number().describe('Total size in bytes'),
	count: z.number().describe('Number of vectors'),
	createdAt: z.number().optional().describe('Creation timestamp (ms)'),
	lastUsed: z.number().optional().describe('Last used timestamp (ms)'),
});

const VectorStatsResponseSchema = z.union([
	VectorNamespaceStatsSchema.extend({
		namespace: z.string().describe('Namespace name'),
		sampledResults: z.record(z.string(), VectorItemStatsSchema).optional(),
	}),
	z.record(z.string(), VectorNamespaceStatsSchema),
]);

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'Get statistics for vector storage',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{ command: getCommand('vector stats'), description: 'Show stats for all namespaces' },
		{
			command: getCommand('vector stats products'),
			description: 'Show detailed stats for products namespace',
		},
		{ command: getCommand('vector stats embeddings'), description: 'Show stats for embeddings' },
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('the vector namespace (optional)'),
		}),
		response: VectorStatsResponseSchema,
	},
	webUrl: (ctx) =>
		ctx.args.name ? `/services/vector/${encodeURIComponent(ctx.args.name)}` : '/services/vector',

	async handler(ctx) {
		const { args, options } = ctx;
		const storage = await createStorageAdapter(ctx);

		if (args.name) {
			const stats = await storage.getStats(args.name);

			if (!options.json) {
				if (stats.count === 0 && stats.sum === 0) {
					tui.info(`Namespace ${tui.bold(args.name)} is empty or does not exist`);
				} else {
					tui.info(`Statistics for ${tui.bold(args.name)}:`);
					tui.info(`  Vectors: ${stats.count}`);
					const sizeDisplay =
						stats.sum < 1024 * 1024
							? `${stats.sum.toLocaleString()} bytes`
							: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
					tui.info(`  Total size: ${sizeDisplay}`);

					if (stats.createdAt) {
						tui.info(`  Created: ${new Date(stats.createdAt).toLocaleString()}`);
					}
					if (stats.lastUsed) {
						tui.info(`  Last used: ${new Date(stats.lastUsed).toLocaleString()}`);
					}

					if (stats.sampledResults && Object.keys(stats.sampledResults).length > 0) {
						tui.info('');
						tui.info(`  Sample vectors (${Object.keys(stats.sampledResults).length}):`);

						const tableData = Object.entries(stats.sampledResults).map(([key, item]) => {
							const docPreview = item.document
								? item.document.length > 30
									? item.document.substring(0, 27) + '...'
									: item.document
								: '-';
							return {
								Key: key,
								Size: `${item.size} bytes`,
								Accesses: item.count,
								'Last Used': new Date(item.lastUsed).toLocaleDateString(),
								Document: docPreview,
							};
						});

						tui.table(tableData, [
							{ name: 'Key', alignment: 'left' },
							{ name: 'Size', alignment: 'right' },
							{ name: 'Accesses', alignment: 'right' },
							{ name: 'Last Used', alignment: 'left' },
							{ name: 'Document', alignment: 'left' },
						]);
					}
				}
			}

			return {
				namespace: args.name,
				...stats,
			};
		} else {
			const allStats = await storage.getAllStats();
			const entries = Object.entries(allStats);

			if (!options.json) {
				if (entries.length === 0) {
					tui.info('No vector namespaces found');
				} else {
					tui.info(
						`Found ${entries.length} ${tui.plural(entries.length, 'namespace', 'namespaces')}:`
					);

					const tableData = entries.map(([name, stats]) => {
						const sizeDisplay =
							stats.sum < 1024 * 1024
								? `${stats.sum.toLocaleString()} bytes`
								: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
						return {
							Namespace: name,
							Vectors: stats.count,
							Size: sizeDisplay,
							Created: stats.createdAt
								? new Date(stats.createdAt).toLocaleDateString()
								: '-',
							'Last Used': stats.lastUsed
								? new Date(stats.lastUsed).toLocaleDateString()
								: '-',
						};
					});

					tui.table(tableData, [
						{ name: 'Namespace', alignment: 'left' },
						{ name: 'Vectors', alignment: 'right' },
						{ name: 'Size', alignment: 'right' },
						{ name: 'Created', alignment: 'left' },
						{ name: 'Last Used', alignment: 'left' },
					]);
				}
			}

			return allStats;
		}
	},
});

export default statsSubcommand;
