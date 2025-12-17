import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const VectorGetResponseSchema = z.object({
	exists: z.boolean().describe('Whether the vector exists'),
	key: z.string().optional().describe('Vector key'),
	id: z.string().optional().describe('Vector ID'),
	metadata: z.record(z.string(), z.unknown()).optional().describe('Vector metadata'),
	document: z.string().optional().describe('Original document text'),
	similarity: z.number().optional().describe('Similarity score'),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get a specific vector entry by key',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('vector get products chair-001'),
			description: 'Get a specific product vector',
		},
		{
			command: getCommand('vector get knowledge-base doc-123'),
			description: 'Get a document from knowledge base',
		},
		{
			command: getCommand('vector get embeddings user-profile-456'),
			description: 'Get user profile embedding',
		},
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the vector storage namespace'),
			key: z.string().min(1).describe('the key of the vector to retrieve'),
		}),
		response: VectorGetResponseSchema,
	},
	webUrl: (ctx) => `/services/vector/${ctx.args.namespace}`,

	async handler(ctx) {
		const { args, options } = ctx;
		const storage = await createStorageAdapter(ctx);
		const started = Date.now();

		const result = await storage.get(args.namespace, args.key);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.exists) {
				tui.success(
					`Found vector "${tui.bold(args.key)}" in ${tui.bold(args.namespace)} (${durationMs}ms)`
				);

				const data = result.data;
				tui.info(`  ID: ${data.id}`);
				tui.info(`  Key: ${data.key}`);

				if (data.similarity !== undefined) {
					tui.info(`  Similarity: ${(data.similarity * 100).toFixed(1)}%`);
				}

				if (data.document) {
					const docPreview =
						data.document.length > 200
							? data.document.substring(0, 197) + '...'
							: data.document;
					tui.info(`  Document: ${docPreview}`);
				}

				if (data.metadata && Object.keys(data.metadata).length > 0) {
					tui.info(`  Metadata: ${JSON.stringify(data.metadata, null, 2)}`);
				}

				if (data.embeddings) {
					tui.info(`  Embeddings: [${data.embeddings.length} dimensions]`);
				}
			} else {
				tui.warning(`Vector "${tui.bold(args.key)}" not found in ${tui.bold(args.namespace)}`);
			}
		}

		if (result.exists) {
			return {
				exists: true,
				key: result.data.key,
				id: result.data.id,
				metadata: result.data.metadata,
				document: result.data.document,
				similarity: result.data.similarity,
			};
		}

		return {
			exists: false,
		};
	},
});

export default getSubcommand;
