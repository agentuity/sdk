import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const headersAgent = createAgent('routing-headers', {
	description: 'Agent that works with custom headers',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			message: s.string(),
			sessionId: s.string(),
			timestamp: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		// Return session ID from context (acts like a custom header)
		return {
			message: input.message,
			sessionId: ctx.sessionId,
			timestamp: Date.now(),
		};
	},
});

export default headersAgent;
