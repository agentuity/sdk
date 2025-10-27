import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

interface DocMetadata extends Record<string, unknown> {
	category: string;
	source: string;
}

const agent = createAgent({
	schema: {
		input: z.object({
			operation: z.enum(['upsert', 'get', 'getMany', 'search', 'delete', 'exists']),
			key: z.string().optional(),
			keys: z.array(z.string()).optional(),
			document: z.string().optional(),
			query: z.string().optional(),
			category: z.string().optional(),
		}),
		output: z.discriminatedUnion('operation', [
			z.object({
				operation: z.literal('upsert'),
				success: z.boolean(),
				result: z.array(z.object({ key: z.string(), id: z.string() })),
			}),
			z.object({
				operation: z.literal('get'),
				success: z.boolean(),
				result: z.union([
					z
						.object({
							id: z.string(),
							key: z.string(),
							document: z.string().optional(),
							embedding: z.array(z.number().finite()).optional(),
							metadata: z.union([z.object({}).passthrough(), z.null()]).optional(),
						})
						.catchall(z.unknown()),
					z.null(),
				]),
			}),
			z.object({
				operation: z.literal('getMany'),
				success: z.boolean(),
				result: z.object({
					count: z.number(),
					docs: z.array(
						z
							.object({
								docKey: z.string(),
								id: z.string(),
								key: z.string(),
								document: z.string().optional(),
								embedding: z.array(z.number().finite()).optional(),
								metadata: z.union([z.object({}).passthrough(), z.null()]).optional(),
							})
							.catchall(z.unknown())
					),
				}),
			}),
			z.object({
				operation: z.literal('search'),
				success: z.boolean(),
				result: z.object({
					count: z.number(),
					results: z.array(
						z.object({
							id: z.string(),
							key: z.string(),
							similarity: z.number(),
							metadata: z.union([z.object({}).passthrough(), z.null()]).optional(),
						})
					),
				}),
			}),
			z.object({
				operation: z.literal('delete'),
				success: z.boolean(),
				result: z.string(),
			}),
			z.object({
				operation: z.literal('exists'),
				success: z.boolean(),
				result: z.object({ exists: z.boolean() }),
			}),
		]),
	},
	handler: async (c: AgentContext, { operation, key, keys, document, query, category }) => {
		const storeName = 'test-vector-store';

		switch (operation) {
			case 'upsert': {
				if (!key || !document) {
					throw new Error('Key and document are required for upsert operation');
				}
				const results = await c.vector.upsert(storeName, {
					key,
					document,
					metadata: {
						category: category || 'general',
						source: 'test-agent',
					},
				});

				return {
					operation,
					success: true,
					result: results,
				};
			}

			case 'get': {
				if (!key) {
					throw new Error('Key is required for get operation');
				}
				const result = await c.vector.get<DocMetadata>(storeName, key);
				return {
					operation,
					success: result.exists,
					result: result.exists ? result.data : null,
				};
			}

			case 'getMany': {
				if (!keys || keys.length === 0) {
					throw new Error('Keys are required for getMany operation');
				}
				const resultMap = await c.vector.getMany<DocMetadata>(storeName, ...keys);
				return {
					operation,
					success: true,
					result: {
						count: resultMap.size,
						docs: Array.from(resultMap.entries()).map(([k, v]) => ({ docKey: k, ...v })),
					},
				};
			}

			case 'search': {
				if (!query) {
					throw new Error('Query is required for search operation');
				}
				const results = await c.vector.search<DocMetadata>(storeName, {
					query,
					limit: 5,
					similarity: 0.7,
					...(category && { metadata: { category, source: 'test-agent' } }),
				});

				return {
					operation,
					success: true,
					result: {
						count: results.length,
						results: results.map((r) => ({
							id: r.id,
							key: r.key,
							similarity: r.similarity,
							metadata: r.metadata,
						})),
					},
				};
			}

			case 'delete': {
				if (!keys || keys.length === 0) {
					throw new Error('Keys are required for delete operation');
				}
				const count = await c.vector.delete(storeName, ...keys);
				return {
					operation,
					success: true,
					result: `Deleted ${count} vectors`,
				};
			}

			case 'exists': {
				const exists = await c.vector.exists(storeName);
				return {
					operation,
					success: true,
					result: { exists },
				};
			}
		}
	},
});

export default agent;
