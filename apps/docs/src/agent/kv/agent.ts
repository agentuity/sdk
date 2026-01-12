/**
 * Key-Value Storage Agent
 *
 * Demonstrates KV storage for simple key-based data access. KV is ideal when
 * you know the exact key you're looking for - like user sessions, config values,
 * or cached API responses. For searching by meaning/similarity, use Vector instead.
 *
 * Operations shown:
 * - ctx.kv.get(bucket, key) - Retrieve a value (returns { exists, data })
 * - ctx.kv.set(bucket, key, value, { ttl }) - Store with optional expiration
 * - ctx.kv.getKeys(bucket) - List all keys in a bucket
 *
 * TTL (time-to-live) is in seconds, minimum 60s. Great for caching.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Storage/key-value
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

// Sample data for seeding - demonstrates different value types (string, object, array)
const SAMPLE_KV_DATA = [
	{ key: 'greeting', value: 'Hello from Agentuity KV Storage!' },
	{ key: 'config', value: { theme: 'dark', version: '1.0.0' } },
	{
		key: 'users',
		value: [
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		],
	},
];

const InputSchema = s.union(
	s.object({
		action: s.literal('get'),
		key: s.string(),
	}),
	s.object({
		action: s.literal('list'),
	}),
	s.object({
		action: s.literal('seed'),
	})
);

const agent = createAgent('kv', {
	description: 'Demonstrates Key-Value storage read operations',
	schema: {
		input: InputSchema,
		output: s.object({
			success: s.boolean(),
			message: s.string(),
			data: s.optional(s.unknown()),
		}),
	},
	handler: async (ctx, input) => {
		const bucket = 'sdk-explorer';

		switch (input.action) {
			case 'get': {
				const result = await ctx.kv.get(bucket, input.key);
				if (result.exists) {
					return {
						success: true,
						message: `Key "${input.key}" found`,
						data: result.data,
					};
				}
				return {
					success: false,
					message: `Key "${input.key}" not found`,
				};
			}

			case 'list': {
				const keys = await ctx.kv.getKeys(bucket);
				return {
					success: true,
					message: `Found ${keys.length} key(s)`,
					data: keys,
				};
			}

			case 'seed': {
				// Check if data already exists
				const existingKeys = await ctx.kv.getKeys(bucket);
				if (existingKeys.length > 0) {
					return {
						success: false,
						message: 'Sample data already loaded',
						data: existingKeys,
					};
				}

				// Seed sample data
				for (const item of SAMPLE_KV_DATA) {
					await ctx.kv.set(bucket, item.key, item.value);
				}

				return {
					success: true,
					message: `Loaded ${SAMPLE_KV_DATA.length} sample key-value pairs`,
					data: SAMPLE_KV_DATA.map((item) => item.key),
				};
			}
		}
	},
});

export default agent;
