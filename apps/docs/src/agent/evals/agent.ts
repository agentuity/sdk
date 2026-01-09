/**
 * Evals Demo Agent
 *
 * Demonstrates automated quality checks that run after your agent responds.
 * Evaluations are defined in eval.ts and execute in the background - they don't
 * slow down your response to the user.
 *
 * Two types of evals:
 * - Binary (pass/fail): Does the output meet a specific criteria?
 * - Score (0-1): How well does the output perform on a metric?
 *
 * Evals help you:
 * - Catch quality issues before users do
 * - Track performance over time in the Agentuity console
 * - Build confidence that your agents work correctly at scale
 *
 * See eval.ts for the evaluation definitions.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Agents/evaluations
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const PROMPT = 'Explain what AI is and how it works in a few brief sentences';

export const AgentInput = s.object({});
export const AgentOutput = s.object({
	content: s.string(),
	note: s.string(),
});

const agent = createAgent('evals', {
	description: 'Demonstrates binary and score evaluations',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx) => {
		ctx.logger.info('Generating explanation for evals');

		const { text } = await generateText({
			model: openai('gpt-5-nano'),
			prompt: PROMPT,
		});

		return {
			content: text,
			note: 'Evals run in background - check Agentuity console for results',
		};
	},
});

export default agent;
