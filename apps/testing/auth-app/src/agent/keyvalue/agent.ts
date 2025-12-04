import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'KeyValue Demo',
	},
	schema: {
		input: s.object({
			operation: s.enum([
				'set',
				'get',
				'delete',
				'getKeys',
				'search',
				'getStats',
				'getNamespaces',
			]),
			key: s.string().optional(),
			value: s.string().optional(),
			keyword: s.string().optional(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			result: s.any().optional(),
		}),
	},
	handler: async (c, input) => {
		const { operation, key, value, keyword } = input;
		const storeName = 'test-kv-store';

		switch (operation) {
			case 'set': {
				if (!key || !value) {
					throw new Error('Key and value are required for set operation');
				}
				await c.kv.set(storeName, key, value, { ttl: 350000 });
				return {
					operation,
					success: true,
					result: `Set ${key} = ${value}`,
				};
			}

			case 'get': {
				if (!key) {
					throw new Error('Key is required for get operation');
				}
				const result = await c.kv.get(storeName, key);
				return {
					operation,
					success: result.exists,
					result: result.exists ? result.data : null,
				};
			}

			case 'delete': {
				if (!key) {
					throw new Error('Key is required for delete operation');
				}
				await c.kv.delete(storeName, key);
				return {
					operation,
					success: true,
					result: `Deleted ${key}`,
				};
			}

			case 'getKeys': {
				const keys = await c.kv.getKeys(storeName);
				return {
					operation,
					success: true,
					result: keys,
				};
			}

			case 'search': {
				if (!keyword) {
					throw new Error('Keyword is required for search operation');
				}
				const results = await c.kv.search(storeName, keyword);
				return {
					operation,
					success: true,
					result: Object.keys(results),
				};
			}

			case 'getStats': {
				const stats = await c.kv.getStats(storeName);
				return {
					operation,
					success: true,
					result: stats,
				};
			}

			case 'getNamespaces': {
				const namespaces = await c.kv.getNamespaces();
				return {
					operation,
					success: true,
					result: namespaces,
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default agent;
