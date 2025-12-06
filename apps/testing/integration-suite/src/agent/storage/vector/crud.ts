import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const vectorCrudAgent = createAgent('storage-vector-crud', {
	description: 'Vector storage CRUD operations',
	schema: {
		input: s.object({
			operation: s.string(),
			namespace: s.string(),
			key: s.string().optional(),
			keys: s.array(s.string()).optional(),
			document: s.string().optional(),
			metadata: s.record(s.string(), s.any()).optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			id: s.string().optional(),
			ids: s.array(s.string()).optional(),
			key: s.string().optional(),
			exists: s.boolean().optional(),
			deleted: s.number().optional(),
			data: s.any().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, namespace, key, keys, document, metadata } = input;

		switch (operation) {
			case 'upsert-single': {
				if (!key) throw new Error('Key required for upsert');
				
				// Use pre-computed embeddings to bypass OpenAI API for testing
				// This is a valid 1536-dimensional embedding vector (all zeros for simplicity)
				const testEmbeddings = new Array(1536).fill(0.1);

				const results = await ctx.vector.upsert(namespace, {
					key,
					embeddings: testEmbeddings,
					metadata,
				});

				return {
					operation,
					success: true,
					id: results[0].id,
					key: results[0].key,
				};
			}

			case 'upsert-multiple': {
				if (!keys || keys.length === 0) throw new Error('Keys required for multiple upsert');

				// Use pre-computed embeddings to bypass OpenAI API
				// Create fresh array for each document to avoid shared reference issues
				const docs = keys.map((k, i) => ({
					key: k,
					embeddings: new Array(1536).fill(0.1),
					metadata: { ...metadata, index: i },
				}));

				const results = await ctx.vector.upsert(namespace, ...docs);

				return {
					operation,
					success: true,
					ids: results.map((r) => r.id),
				};
			}

			case 'get': {
				if (!key) throw new Error('Key required for get');

				const result = await ctx.vector.get(namespace, key);

				return {
					operation,
					success: true,
					exists: result.exists,
					data: result.exists ? result.data : undefined,
				};
			}

			case 'get-many': {
				if (!keys || keys.length === 0) throw new Error('Keys required for getMany');

				const results = await ctx.vector.getMany(namespace, ...keys);

				const data: Record<string, any> = {};
				for (const [k, v] of results) {
					data[k] = v;
				}

				return {
					operation,
					success: true,
					data,
				};
			}

			case 'delete': {
				if (!key) throw new Error('Key required for delete');

				const deleted = await ctx.vector.delete(namespace, key);

				return {
					operation,
					success: true,
					deleted,
				};
			}

			case 'delete-many': {
				if (!keys || keys.length === 0) throw new Error('Keys required for deleteMany');

				const deleted = await ctx.vector.delete(namespace, ...keys);

				return {
					operation,
					success: true,
					deleted,
				};
			}

			case 'exists': {
				const exists = await ctx.vector.exists(namespace);

				return {
					operation,
					success: true,
					exists,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default vectorCrudAgent;
