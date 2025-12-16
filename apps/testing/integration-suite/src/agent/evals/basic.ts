import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { politenessEval } from '@agentuity/evals';

const evalsBasicAgent = createAgent('evals-basic', {
	description: 'Agent with evals for testing',
	schema: {
		input: s.object({
			value: s.number(),
		}),
		output: s.object({
			result: s.number(),
			doubled: s.boolean(),
		}),
	},
	handler: async (ctx, input) => {
		const result = input.value * 2;

		return {
			result,
			doubled: true,
		};
	},
});

evalsBasicAgent.createEval(
	politenessEval({ name: 'my-politeness', model: 'gpt-4o', howPolite: 'somewhat' })
);

export default evalsBasicAgent;
