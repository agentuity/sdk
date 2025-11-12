import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// Create evals using agent.createEval()
export const executionEval = agent.createEval({
	metadata: {
		name: 'execution-check',
		description: 'Checks if the agent executed successfully',
	},
	handler: async (_ctx: EvalContext) => {
		console.log('[EVAL execution-check] No input/output (agent has no schemas)');
		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				passed: z.boolean().describe('Whether the agent executed successfully'),
				reason: z.string().describe('Explanation of execution result'),
			}),
			prompt: `Evaluate if the agent executed successfully. Since this agent has no input or output schemas, we're checking if it executed without errors.

Determine if the execution was successful and provide reasoning.`,
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

// Test eval without metadata.name - should use variable name
export const unnamedEval = agent.createEval({
	metadata: {
		description: 'Test eval without name in metadata',
	},
	handler: async (_ctx: EvalContext) => {
		console.log('[EVAL unnamed-eval] Test eval without metadata.name');
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Test eval',
			},
		};
	},
});

// Example eval with no metadata at all - will use variable name (no-metadata-eval)
export const noMetadataEval = agent.createEval({
	handler: async (_ctx: EvalContext) => {
		console.log('[EVAL no-metadata-eval] Example eval with no metadata');
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Example eval with no metadata field',
			},
		};
	},
});
