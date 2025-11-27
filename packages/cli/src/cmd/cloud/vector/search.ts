import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const VectorSearchResultSchema = z.object({
	id: z.string().describe('Vector ID'),
	key: z.string().describe('Vector key'),
	similarity: z.number().describe('Similarity score (0-1)'),
	metadata: z.record(z.string(), z.unknown()).optional().describe('Vector metadata'),
});

const VectorSearchResponseSchema = z.object({
	namespace: z.string().describe('Namespace name'),
	query: z.string().describe('Search query used'),
	results: z.array(VectorSearchResultSchema).describe('Search results'),
	count: z.number().describe('Number of results found'),
});

export const searchSubcommand = createCommand({
	name: 'search',
	aliases: ['list', 'ls'],
	description: 'Search for vectors using semantic similarity',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('vector search products "comfortable office chair"')} - Search for similar products`,
		`${getCommand('vector list knowledge-base "machine learning"')} - Search knowledge base`,
		`${getCommand('vector search docs "API documentation" --limit 5')} - Limit results`,
		`${getCommand('vector search products "ergonomic" --similarity 0.8')} - Set minimum similarity`,
		`${getCommand('vector ls embeddings "neural networks" --metadata category=ai')} - Filter by metadata`,
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the vector storage namespace'),
			query: z.string().min(1).describe('the search query text'),
		}),
		options: z.object({
			limit: z.number().optional().describe('maximum number of results to return (default: 10)'),
			similarity: z
				.number()
				.min(0)
				.max(1)
				.optional()
				.describe('minimum similarity threshold (0.0-1.0)'),
			metadata: z
				.string()
				.optional()
				.describe('filter by metadata (format: key=value or key1=value1,key2=value2)'),
		}),
		response: VectorSearchResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const storage = await createStorageAdapter(ctx);
		const started = Date.now();

		// Parse metadata filter if provided
		let metadataFilter: Record<string, unknown> | undefined;
		if (opts.metadata) {
			const validPairs: Record<string, unknown> = {};
			const malformed: string[] = [];
			const pairs = opts.metadata.split(',');

			for (const pair of pairs) {
				const trimmedPair = pair.trim();
				if (!trimmedPair) continue;

				const firstEqualIdx = trimmedPair.indexOf('=');
				if (firstEqualIdx === -1) {
					malformed.push(trimmedPair);
					continue;
				}

				const key = trimmedPair.substring(0, firstEqualIdx).trim();
				const value = trimmedPair.substring(firstEqualIdx + 1).trim();

				if (!key || !value) {
					malformed.push(trimmedPair);
					continue;
				}

				// Try to parse as JSON for complex values, otherwise use as string
				try {
					validPairs[key] = JSON.parse(value);
				} catch {
					validPairs[key] = value;
				}
			}

			if (malformed.length > 0) {
				ctx.logger.warn(`Skipping malformed metadata pairs: ${malformed.join(', ')}`);
			}

			if (Object.keys(validPairs).length > 0) {
				metadataFilter = validPairs;
			}
		}

		const results = await storage.search(args.namespace, {
			query: args.query,
			limit: opts.limit,
			similarity: opts.similarity,
			metadata: metadataFilter,
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			if (results.length === 0) {
				tui.info(
					`No vectors found matching "${tui.bold(args.query)}" in ${tui.bold(args.namespace)}`
				);
			} else {
				tui.info(
					`Found ${results.length} result(s) in ${tui.bold(args.namespace)} (${durationMs}ms):`
				);

				const tableData = results.map((result) => {
					const metadataStr = result.metadata ? JSON.stringify(result.metadata) : '-';
					return {
						Key: result.key,
						ID: result.id,
						Similarity: `${(result.similarity * 100).toFixed(1)}%`,
						Metadata:
							metadataStr.length > 50 ? metadataStr.substring(0, 47) + '...' : metadataStr,
					};
				});

				tui.table(tableData, [
					{ name: 'Key', alignment: 'left' },
					{ name: 'ID', alignment: 'left' },
					{ name: 'Similarity', alignment: 'right' },
					{ name: 'Metadata', alignment: 'left' },
				]);
			}
		}

		return {
			namespace: args.namespace,
			query: args.query,
			results: results.map((r) => ({
				id: r.id,
				key: r.key,
				similarity: r.similarity,
				metadata: r.metadata,
			})),
			count: results.length,
		};
	},
});

export default searchSubcommand;
