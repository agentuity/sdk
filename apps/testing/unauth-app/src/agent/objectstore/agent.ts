import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
export default createAgent({
	metadata: {
		name: 'ObjectStore Test',
	},
	schema: {
		input: s.object({
			operation: s.enum(['put', 'get', 'delete']),
			bucket: s.string(),
			key: s.string(),
			data: s.string(),
		}),
		output: s.object({
			success: s.boolean(),
			result: s.any(),
		}),
	},
	handler: async (c, { operation, bucket, key, data }) => {
		switch (operation) {
			case 'put': {
				await c.objectstore.put(bucket, key, new TextEncoder().encode(data));
				return { success: true, result: 'Object stored' };
			}
			case 'get': {
				const result = await c.objectstore.get(bucket, key);
				return { success: true, result: result };
			}
			case 'delete': {
				await c.objectstore.delete(bucket, key);
				return { success: true, result: 'Object deleted' };
			}
			default: {
				return { success: false, result: 'Operation not supported' };
			}
		}
	},
});
