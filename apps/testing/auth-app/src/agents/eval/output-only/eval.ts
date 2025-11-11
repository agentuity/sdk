import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// Create evals using agent.createEval()
export const outputQualityEval = agent.createEval({
	metadata: {
		name: 'output-quality',
		description: 'Evaluates the quality of the output',
	},
	handler: async (_ctx: EvalContext, output) => {
		console.log('[EVAL output-quality] Output received:', output);
		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				score: z
					.number()
					.min(0)
					.max(1)
					.describe('Quality score from 0 to 1'),
				reason: z.string().describe('Explanation of the quality score'),
			}),
			prompt: `Evaluate the quality of the following agent output.

Agent Output: ${output}

Provide a quality score from 0 to 1 and explain your reasoning.`,
		});

		return {
			success: true as const,
			score: object.score,
			metadata: {
				reason: object.reason,
			},
		};
	},
});

