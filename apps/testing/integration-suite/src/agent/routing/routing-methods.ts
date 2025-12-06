import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const methodsAgent = createAgent('routing-methods', {
	description: 'Agent that supports multiple HTTP methods',
	schema: {
		input: s.object({
			action: s.string(),
			data: s.string().optional(),
		}),
		output: s.object({
			method: s.string(),
			action: s.string(),
			result: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		// In a real scenario, we'd detect the HTTP method from context
		// For now, we'll just echo back the action
		return {
			method: 'POST', // Default for agent calls
			action: input.action,
			result: `Processed: ${input.action}${input.data ? ` with data: ${input.data}` : ''}`,
		};
	},
});

export default methodsAgent;
