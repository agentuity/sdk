import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// Create evals using agent.createEval()
export const greetingEval = agent.createEval({
	metadata: {
		name: 'greeting-check',
		description: 'Checks if the output contains a greeting word using LLM',
	},
	handler: async (_ctx: EvalContext, input, output) => {
		console.log('[EVAL greeting-check] Input received:', JSON.stringify(input, null, 2));
		console.log('[EVAL greeting-check] Output received:', output);
		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				passed: z.boolean().describe('Whether the output contains a greeting'),
				reason: z.string().describe('Explanation of why it passed or failed'),
			}),
			prompt: `Evaluate if the following agent output contains a greeting word (like hello, hi, hey, greetings, etc.).

Agent Input: ${JSON.stringify(input)}
Agent Output: ${output}

Determine if the output contains a greeting and provide reasoning.`,
		});

		return {
			success: true as const,
			passed: object.passed,
			metadata: {
				reason: object.reason,
			},
		};
	},
});

export const qualityEval = agent.createEval({
	metadata: {
		name: 'output-quality',
		description: 'Scores the output quality using LLM',
	},
	handler: async (_ctx: EvalContext, input, output) => {
		console.log('[EVAL output-quality] Input received:', JSON.stringify(input, null, 2));
		console.log('[EVAL output-quality] Output received:', output);
		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				score: z.number().min(0).max(1).describe('Quality score from 0 to 1'),
				reason: z.string().describe('Explanation of the quality score'),
			}),
			prompt: `Evaluate the quality of the following agent output. Consider factors like:
- Relevance to the input
- Appropriateness of the response
- Completeness
- Clarity and professionalism

Agent Input: ${JSON.stringify(input)}
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
