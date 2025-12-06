import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const vectorSearchAgent = createAgent('storage-vector-search', {
	description: 'Vector storage search operations',
	schema: {
		input: s.object({
			namespace: s.string(),
			query: s.string().optional(),
			limit: s.number().optional(),
			similarity: s.number().optional(),
			metadata: s.record(s.string(), s.any()).optional(),
		}),
		output: s.object({
			success: s.boolean(),
			results: s.array(
				s.object({
					id: s.string(),
					key: s.string(),
					similarity: s.number(),
					metadata: s.record(s.string(), s.any()).optional(),
				})
			).optional(),
			count: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		const { namespace, limit, similarity, metadata } = input;
		
		// Use static query text - will leverage embedding cache from upsert operations
		const query = input.query || 'test document';

		const results = await ctx.vector.search(namespace, {
			query,
			limit,
			similarity,
			metadata,
		});

		return {
			success: true,
			results: results?.length > 0 ? results.map((r) => ({
				id: r.id,
				key: r.key,
				similarity: r.similarity,
				metadata: r.metadata || undefined,
			})) : [],
			count: results?.length || 0,
		};
	},
});

export default vectorSearchAgent;
