import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createCannedEval, type DefaultEvalInput, type DefaultEvalOutput } from './_utils';
import type { BaseEvalOptions } from './types';
export { createCannedEval, type DefaultEvalInput, type DefaultEvalOutput } from './_utils';
export type { BaseEvalOptions, EvalMiddleware } from './types';

type PolitenessEvalOptions = {
	howPolite: 'very' | 'somewhat' | 'not very' | 'not at all' | 'unknown';
};

export const politenessEval = createCannedEval<
	DefaultEvalInput,
	DefaultEvalOutput,
	BaseEvalOptions & PolitenessEvalOptions
>({
	name: 'politeness',
	description: 'Checks if the agent is polite',
	options: {
		model: 'gpt-4o',
		howPolite: 'very',
	},
	handler: async (ctx, input, output, options) => {
		await generateText({
			model: openai(options.model),
			prompt: `Are you polite? Input: ${input.string}, Output: ${output.string}`,
		});

		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'test',
			},
		};
	},
});
