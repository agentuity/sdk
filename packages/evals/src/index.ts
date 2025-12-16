import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createCannedEval } from './_utils';
import type { BaseEvalOptions } from './types';
import { s } from '@agentuity/schema';
import { InferSchemaOutput } from '../../runtime/dist/_validation';
export { createCannedEval } from './_utils';
export type { BaseEvalOptions } from './types';
import { InferSchemaInput } from '../../runtime/dist/_validation';

type MyInputSchema = InferSchemaInput<StandardSchemaV1<typeof s.object({ value: s.string() })>>;
type MyOutputSchema = InferSchemaOutput<typeof s.object({ result: s.string() })>;

type PolitenessEvalOptions = {
	howPolite: 'very' | 'somewhat' | 'not very' | 'not at all' | 'unknown';
};

export const politenessEval = createCannedEval<
	typeof myInputSchema,
	typeof myOutputSchema,
	BaseEvalOptions & PolitenessEvalOptions
>({
	name: 'politeness',
	description: 'Checks if the agent is polite',
	options: {
		model: 'gpt-4o',
		howPolite: 'very',
	},
	handler: async (ctx, _input, _output, options) => {
		await generateText({
			model: openai(options.model),
			prompt: 'Are you polite?',
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
