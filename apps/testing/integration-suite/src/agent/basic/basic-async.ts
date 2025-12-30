import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const asyncAgent = createAgent('async', {
	description: 'Agent with async handler execution',
	schema: {
		input: s.object({
			delay: s.number(),
			message: s.string(),
		}),
		output: s.object({
			result: s.string(),
			elapsed: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		const start = Date.now();

		// Simulate async work
		await new Promise((resolve) => setTimeout(resolve, input.delay));

		const elapsed = Date.now() - start;

		return {
			result: `Processed: ${input.message}`,
			elapsed,
		};
	},
});

export default asyncAgent;
