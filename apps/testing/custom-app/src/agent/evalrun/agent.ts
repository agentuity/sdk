import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent({
	metadata: {
		name: 'EvalRun Test Agent',
		description: 'Agent for testing eval run functionality',
	},
	schema: {
		input: s.object({
			action: s.string().describe('The action to perform'),
		}),
		output: s.object({
			success: s.boolean().describe('Whether the action succeeded'),
		}),
	},
	handler: async (_ctx: any, _input: any) => {
		return { success: true };
	},
});
