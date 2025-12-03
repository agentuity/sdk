import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';
export default createAgent({
	metadata: {
		name: 'ObjectStore Test',
	},
	schema: {
		input: z.object({
			operation: z.enum(['put', 'get', 'delete']),
			bucket: z.string(),
			key: z.string(),
			data: z.string(),
		}),
		output: z.object({
			success: z.boolean(),
			result: z.any(),
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
