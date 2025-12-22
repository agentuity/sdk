import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import {
	createPresetEval,
	interpolatePrompt,
	type DefaultEvalInput,
	type DefaultEvalOutput,
} from './_utils';
import type { BaseEvalOptions } from './types';

export const politenessPrompt = `You are evaluating the politeness of an LLM response.

## Inputs

- USER REQUEST: {{USER_REQUEST}}
- MODEL RESPONSE: {{MODEL_RESPONSE}}

## Your task

1. Assume a reasonable but socially sensitive end user reading the response.
2. Read the MODEL RESPONSE literally, without assuming positive intent.
3. Identify any language that could reasonably be perceived as rude, dismissive, condescending, sarcastic, hostile, or overly curt.

## Score

- Start from 1.0.
- Subtract points for each issue:
   - Mildly curt or cold phrasing: −0.2
   - Dismissive or condescending phrasing: −0.4
   - Hostile, sarcastic, or disrespectful phrasing: −0.6
- Minimum score is 0.0.
- Multiple violations compound independently.

## Pass/Fail

- passed = true only if score ≥ 0.8 AND no hostile or dismissive language is present.

## Constraints

- Do not infer intent beyond the text.
- Do not excuse tone due to correctness or usefulness.
- Do not normalize bluntness unless explicitly requested.

## Output format (STRICT JSON, one line reason):

{
  "score": <number between 0.0 and 1.0>,
  "passed": <true|false>,
  "metadata": {
    "reason": "<single concise sentence explaining the score>"
  }
}`;

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

export const politenessEval = createPresetEval<
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
