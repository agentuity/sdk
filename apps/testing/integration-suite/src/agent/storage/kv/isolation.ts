import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const kvIsolationAgent = createAgent('storage-kv-isolation', {
	description: 'Test KV isolation between requests',
	schema: {
		input: s.object({
			key: s.string(),
			value: s.string(),
			namespace: s.string().optional(),
		}),
		output: s.object({
			key: s.string(),
			setValue: s.string(),
			getValue: s.string().optional(),
			sessionId: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		const { namespace = 'test' } = input;

		// Set a value
		await ctx.kv.set(namespace, input.key, input.value);

		// Immediately get it back
		const result = await ctx.kv.get<string>(namespace, input.key);

		return {
			key: input.key,
			setValue: input.value,
			getValue: result.exists ? result.data : undefined,
			sessionId: ctx.sessionId,
		};
	},
});

export default kvIsolationAgent;
