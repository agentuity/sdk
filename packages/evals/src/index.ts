import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import {
	createCannedEval,
	interpolatePrompt,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
import type { BaseEvalOptions } from './types';
import { politenessPrompt } from './prompts';

export {
	createCannedEval,
	interpolatePrompt,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
export type { BaseEvalOptions, EvalMiddleware } from './types';
export { politenessPrompt } from './prompts';

type PolitenessEvalOptions = {
	threshold: number;
};

type EvalResponse = {
	score: number;
	passed: boolean;
	metadata: {
		reason: string;
	};
};

export const politenessEval = createCannedEval<
	DefaultEvalInput,
	DefaultEvalOutput,
	BaseEvalOptions & PolitenessEvalOptions
>({
	name: 'politeness',
	description: 'Evaluates politeness of agent responses using LLM-as-judge',
	options: {
		model: 'gpt-4o',
		threshold: 0.8,
	},
	handler: async (ctx, input, output, options) => {
		const prompt = interpolatePrompt(politenessPrompt, {
			USER_REQUEST: input.request,
			MODEL_RESPONSE: output.response,
		});

		try {
			const result = await generateText({
				model: openai(options.model),
				prompt,
			});

			const evaluation = JSON.parse(result.text) as EvalResponse;

			return {
				success: true as const,
				passed: evaluation.passed && evaluation.score >= options.threshold,
				score: evaluation.score,
				metadata: {
					reason: evaluation.metadata.reason,
					model: options.model,
					threshold: options.threshold,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false as const,
				error: `Eval failed: ${message}`,
			};
		}
	},
});
