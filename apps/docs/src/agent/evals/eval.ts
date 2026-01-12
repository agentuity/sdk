/**
 * Evals for the evals demo agent.
 * - answer-completeness (score, from 0-1): Did the response fully address the prompt?
 * - factual-claims (binary, pass/fail): Does it contain factual claims about technology?
 *
 * Results are stored in KV for the frontend to poll.
 */

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import agent, { PROMPT } from './agent';

// KV bucket for storing eval results (5 min TTL for demo purposes)
export const EVAL_BUCKET = 'sdk-explorer-evals';
export const EVAL_NAMES = ['answer-completeness', 'factual-claims'] as const;
const EVAL_TTL = 300; // 5 minutes

// Helper to store eval result in KV
async function storeEvalResult(
	ctx: {
		sessionId: string;
		kv: {
			set: (
				bucket: string,
				key: string,
				value: unknown,
				opts?: { ttl: number }
			) => Promise<void>;
		};
	},
	evalName: string,
	result: { passed: boolean; score?: number; reason?: string; metadata?: Record<string, unknown> }
) {
	const key = `${ctx.sessionId}:${evalName}`;
	await ctx.kv.set(
		EVAL_BUCKET,
		key,
		{
			evalId: evalName,
			pending: false,
			success: true,
			error: null,
			result,
			completedAt: new Date().toISOString(),
		},
		{ ttl: EVAL_TTL }
	);
}

/**
 * Custom Eval (score type): Answer Completeness
 * Evaluates whether the response fully addresses the prompt.
 * Returns a score from 0-1 and stores result in KV.
 */
const CompletenessSchema = z.object({
	score: z
		.number()
		.min(0)
		.max(1)
		.describe('How completely the response addresses the prompt (0-1)'),
	reason: z.string().describe('Brief explanation of the score'),
});

export const completenessEval = agent.createEval('answer-completeness', {
	description: 'Evaluates whether the response fully addresses the prompt',
	handler: async (ctx, _input, output) => {
		try {
			const { object: result } = await generateObject({
				model: openai('gpt-5-nano'),
				schema: CompletenessSchema,
				prompt: `Evaluate how completely this response addresses the given prompt.

Prompt: "${PROMPT}"

Response: "${output.content}"

Score from 0 (completely misses the point) to 1 (fully addresses all aspects).`,
			});

			const passed = (result?.score ?? 0) >= 0.7;
			const evalResult = {
				passed,
				score: result?.score ?? 0,
				reason: result?.reason ?? 'Failed to evaluate',
			};

			ctx.logger.info('[EVAL] answer-completeness', {
				passed: evalResult.passed,
				score: evalResult.score,
			});

			await storeEvalResult(ctx, 'answer-completeness', evalResult);
			return evalResult;
		} catch (error) {
			const evalResult = {
				passed: false,
				score: 0,
				reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
			ctx.logger.error('[EVAL] answer-completeness failed', { error });
			await storeEvalResult(ctx, 'answer-completeness', evalResult);
			return evalResult;
		}
	},
});

/**
 * Custom Eval (binary type): Factual Claims
 * Verifies the response contains factual claims about technology.
 * Uses generateObject with Zod schema for structured output.
 */
const FactualCheckSchema = z.object({
	containsFactualClaims: z
		.boolean()
		.describe('Whether the text contains factual claims about technology'),
	reason: z.string().describe('Brief explanation'),
});

export const factualClaimsEval = agent.createEval('factual-claims', {
	description: 'Verifies the response contains factual claims about technology',
	handler: async (ctx, _input, output) => {
		if (!output.content || output.content.trim() === '') {
			const evalResult = {
				passed: false,
				reason: 'No content produced',
			};
			ctx.logger.info('[EVAL] factual-claims', { passed: false });
			await storeEvalResult(ctx, 'factual-claims', evalResult);
			return evalResult;
		}

		try {
			const { object: result } = await generateObject({
				model: openai('gpt-5-nano'),
				schema: FactualCheckSchema,
				prompt: `Analyze whether the following text contains factual claims about technology (real facts, statistics, actual capabilities, or verifiable information - not just fiction).

Text to analyze:

"${output.content}"

Does this text contain factual claims about technology?`,
			});

			const evalResult = {
				passed: result?.containsFactualClaims ?? false,
				reason: result?.reason ?? 'Failed to evaluate',
			};

			ctx.logger.info('[EVAL] factual-claims', { passed: evalResult.passed });

			await storeEvalResult(ctx, 'factual-claims', evalResult);
			return evalResult;
		} catch (error) {
			const evalResult = {
				passed: false,
				reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
			ctx.logger.error('[EVAL] factual-claims failed', { error });
			await storeEvalResult(ctx, 'factual-claims', evalResult);
			return evalResult;
		}
	},
});
