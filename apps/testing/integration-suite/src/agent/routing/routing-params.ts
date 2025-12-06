import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const paramsAgent = createAgent('routing-params', {
	description: 'Agent for testing route parameters',
	schema: {
		input: s.object({
			id: s.string(),
			action: s.string().optional(),
		}),
		output: s.object({
			id: s.string(),
			action: s.string(),
			found: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		return {
			id: input.id,
			action: input.action ?? 'view',
			found: true,
		};
	},
});

export default paramsAgent;
