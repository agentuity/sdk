/**
 * KeyValue Storage Example
 *
 * Demonstrates how to use the KeyValue storage service for CRUD operations.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const inputSchema = s.union([
	s.object({
		operation: s.literal('set'),
		key: s.string(),
		value: s.any(),
		ttl: s.number().optional(),
	}),
	s.object({
		operation: s.literal('get'),
		key: s.string(),
	}),
	s.object({
		operation: s.literal('delete'),
		key: s.string(),
	}),
	s.object({
		operation: s.literal('getKeys'),
	}),
	s.object({
		operation: s.literal('search'),
		keyword: s.string(),
	}),
]);

export default createAgent('keyvalue', {
	description: 'Example agent demonstrating KeyValue storage operations',
	schema: {
		input: inputSchema,
		output: s.any(),
	},
	handler: async (ctx, input) => {
		const store = 'example-store';

		switch (input.operation) {
			case 'set':
				await ctx.kv.set(store, input.key, input.value, {
					ttl: input.ttl,
				});
				ctx.logger.info('Value stored', { key: input.key });
				return { success: true, message: `Stored ${input.key}` };

			case 'get': {
				const result = await ctx.kv.get(store, input.key);
				if (!result.exists) {
					return { exists: false, message: 'Key not found' };
				}
				return { exists: true, value: result.data };
			}

			case 'delete':
				await ctx.kv.delete(store, input.key);
				ctx.logger.info('Value deleted', { key: input.key });
				return { success: true, message: `Deleted ${input.key}` };

			case 'getKeys': {
				const keys = await ctx.kv.getKeys(store);
				return { keys, count: keys.length };
			}

			case 'search': {
				const results = await ctx.kv.search(store, input.keyword);
				return { results, count: Object.keys(results).length };
			}

			default:
				return { error: 'Unknown operation' };
		}
	},
});
