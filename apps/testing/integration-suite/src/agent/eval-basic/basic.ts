import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const AgentInput = s.object({
	value: s.number(),
});
export const AgentOutput = s.object({
	result: s.number(),
	doubled: s.boolean(),
});

const evalsBasicAgent = createAgent('evals-basic', {
	description: 'Agent with evals for testing',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx, input) => {
		const result = input.value * 2;

		return {
			result,
			doubled: true,
		};
	},
});

export default evalsBasicAgent;
