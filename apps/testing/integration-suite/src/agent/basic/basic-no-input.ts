import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const noInputAgent = createAgent('no-input', {
	description: 'Agent with no input schema (void input)',
	schema: {
		output: s.object({
			timestamp: s.number(),
			random: s.number(),
		}),
	},
	handler: async (ctx) => {
		return {
			timestamp: Date.now(),
			random: Math.random(),
		};
	},
});

export default noInputAgent;
