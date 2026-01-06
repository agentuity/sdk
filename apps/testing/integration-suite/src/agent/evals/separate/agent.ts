import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const SeparateEvalsInput = s.object({
	value: s.number(),
});

export const SeparateEvalsOutput = s.object({
	doubled: s.number(),
});

const separateEvalsAgent = createAgent('evals-separate', {
	description: 'Agent with evals in a separate file',
	schema: {
		input: SeparateEvalsInput,
		output: SeparateEvalsOutput,
	},
	handler: async (_ctx, input) => {
		return {
			doubled: input.value * 2,
		};
	},
});

export default separateEvalsAgent;
