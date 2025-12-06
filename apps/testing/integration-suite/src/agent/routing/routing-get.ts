import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const getAgent = createAgent('routing-get', {
	description: 'GET endpoint that reads query parameters',
	schema: {
		input: s.object({
			query: s.string(),
			limit: s.number().optional(),
		}),
		output: s.object({
			query: s.string(),
			limit: s.number(),
			timestamp: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		return {
			query: input.query,
			limit: input.limit ?? 10,
			timestamp: Date.now(),
		};
	},
});

export default getAgent;
