import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent({
	metadata: {
		name: 'EvalRun Test Agent',
		description: 'Agent for testing eval run functionality',
	},
	schema: {
		input: z.object({
			action: z.string().describe('The action to perform'),
		}),
		output: z.object({
			success: z.boolean().describe('Whether the action succeeded'),
		}),
	},
	handler: async (_ctx, _input) => {
		return { success: true };
	},
});
