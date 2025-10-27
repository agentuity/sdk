import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({
			operation: z.enum(['set', 'get', 'delete']),
			key: z.string(),
			value: z.string().optional(),
		}),
		output: z.object({
			operation: z.string(),
			success: z.boolean(),
			result: z.any().optional(),
		}),
	},
	handler: async (c: AgentContext, { operation, key, value }) => {
		const storeName = 'test-kv-store';

		switch (operation) {
			case 'set': {
				if (!value) {
					throw new Error('Value is required for set operation');
				}
				await c.kv.set(storeName, key, value, { ttl: 300000 });
				return {
					operation,
					success: true,
					result: `Set ${key} = ${value}`,
				};
			}

			case 'get': {
				const result = await c.kv.get(storeName, key);
				return {
					operation,
					success: result.exists,
					result: result.exists ? result.data : null,
				};
			}

			case 'delete': {
				await c.kv.delete(storeName, key);
				return {
					operation,
					success: true,
					result: `Deleted ${key}`,
				};
			}
		}
	},
});

export default agent;
