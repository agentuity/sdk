import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// Create evals using agent.createEval()
export const inputValidationEval = agent.createEval({
	metadata: {
		name: 'input-validation',
		description: 'Validates that the input message is properly formatted',
	},
	handler: async (_ctx: EvalContext, input) => {
		console.log('[EVAL input-validation] Input received:', JSON.stringify(input, null, 2));
		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				passed: z.boolean().describe('Whether the input is valid'),
				reason: z.string().describe('Explanation of validation result'),
			}),
			prompt: `Evaluate if the following agent input is properly formatted and valid.

Agent Input: ${JSON.stringify(input)}

Determine if the input is valid and provide reasoning.`,
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
