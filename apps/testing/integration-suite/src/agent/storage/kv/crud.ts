import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const kvCrudAgent = createAgent('storage-kv-crud', {
	description: 'KeyValue storage CRUD operations',
	schema: {
		input: s.object({
			operation: s.enum(['set', 'get', 'delete', 'has']),
			key: s.string(),
			value: s.string().optional(),
			namespace: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			key: s.string(),
			value: s.string().optional(),
			exists: s.boolean().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, key, value, namespace = 'test' } = input;

		switch (operation) {
			case 'set':
				if (!value) throw new Error('Value required for set operation');
				await ctx.kv.set(namespace, key, value);
				return { operation, key, value, success: true };

			case 'get': {
				const result = await ctx.kv.get<string>(namespace, key);
				return {
					operation,
					key,
					value: result.exists ? result.data : undefined,
					exists: result.exists,
					success: true,
				};
			}

			case 'delete':
				await ctx.kv.delete(namespace, key);
				return { operation, key, success: true };

			case 'has': {
				const result = await ctx.kv.get(namespace, key);
				return { operation, key, exists: result.exists, success: true };
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default kvCrudAgent;
