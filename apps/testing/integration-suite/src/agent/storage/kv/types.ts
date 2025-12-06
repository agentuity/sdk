import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const kvTypesAgent = createAgent('storage-kv-types', {
	description: 'KeyValue storage with different value types',
	schema: {
		input: s.object({
			operation: s.enum(['set-string', 'set-object', 'set-number', 'set-boolean', 'get']),
			key: s.string(),
			value: s.any().optional(),
			namespace: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			key: s.string(),
			value: s.any().optional(),
			valueType: s.string().optional(),
			success: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, key, value, namespace = 'test' } = input;

		switch (operation) {
			case 'set-string':
				await ctx.kv.set(namespace, key, String(value));
				return { operation, key, value, valueType: 'string', success: true };

			case 'set-object':
				// Store object as JSON
				await ctx.kv.set(namespace, key, value, { contentType: 'application/json' });
				return { operation, key, value, valueType: 'object', success: true };

			case 'set-number':
				await ctx.kv.set(namespace, key, Number(value));
				return { operation, key, value: Number(value), valueType: 'number', success: true };

			case 'set-boolean':
				await ctx.kv.set(namespace, key, Boolean(value));
				return { operation, key, value: Boolean(value), valueType: 'boolean', success: true };

			case 'get': {
				const result = await ctx.kv.get(namespace, key);
				return {
					operation,
					key,
					value: result.exists ? result.data : undefined,
					valueType: result.exists ? typeof result.data : 'undefined',
					success: true,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default kvTypesAgent;
