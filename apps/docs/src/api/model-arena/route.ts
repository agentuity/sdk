/**
 * Model Arena Route - Multi-provider story generation with LLM-as-judge evaluation.
 *
 * GET /       - Returns metadata about the arena configuration
 * SSE /stream - Streams story generation from OpenAI and Anthropic, then judge verdict
 */
import { createRouter, sse } from '@agentuity/runtime';
import { generateObject } from 'ai';
import { generateStory, JUDGE_MODEL, MODELS } from '../../agent/model-arena/lib';
import { getJudgePrompt } from '../../agent/model-arena/prompts';
import {
	JudgmentSchema,
	type ModelResult,
	PROVIDER_DISPLAY_NAMES,
	type Tone,
} from '../../agent/model-arena/types';

const router = createRouter();

// Fixed prompt and tone for the demo
const FIXED_PROMPT = 'A robot discovers it can dream';
const FIXED_TONE: Tone = 'sci-fi';

// GET endpoint for metadata
router.get('/', (c) => {
	return c.json({
		name: 'Model Arena',
		description: 'Compare short stories from OpenAI and Anthropic with LLM-as-judge evaluation',
		prompt: FIXED_PROMPT,
		tone: FIXED_TONE,
		competitors: MODELS.map((m) => ({
			provider: m.provider,
			displayName: PROVIDER_DISPLAY_NAMES[m.provider],
			model: m.model,
		})),
	});
});

// SSE endpoint for streaming results
router.get(
	'/stream',
	sse(async (c, stream) => {
		const sessionId = c.var.sessionId;

		c.var.logger?.info('Model Arena SSE starting', {
			prompt: FIXED_PROMPT,
			tone: FIXED_TONE,
			sessionId,
		});

		// Send start event
		await stream.writeSSE({
			event: 'start',
			data: JSON.stringify({
				prompt: FIXED_PROMPT,
				tone: FIXED_TONE,
				providers: MODELS.map((m) => ({
					provider: m.provider,
					displayName: PROVIDER_DISPLAY_NAMES[m.provider],
					model: m.model,
				})),
			}),
			id: 'start',
		});

		const results: ModelResult[] = [];

		// Run all models in parallel, stream each story as it completes
		const promises = MODELS.map(async (config) => {
			try {
				const result = await generateStory(config, FIXED_PROMPT, FIXED_TONE);
				results.push(result);

				await stream.writeSSE({
					event: 'story',
					data: JSON.stringify({
						provider: result.provider,
						displayName: PROVIDER_DISPLAY_NAMES[result.provider],
						model: result.model,
						story: result.story,
						generationMs: result.generationMs,
						tokens: result.tokens,
					}),
					id: `story-${result.provider}`,
				});

				c.var.logger?.info('Story completed', {
					provider: result.provider,
					generationMs: result.generationMs,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				c.var.logger?.error('Story generation failed', {
					provider: config.provider,
					error: message,
				});

				await stream.writeSSE({
					event: 'error',
					data: JSON.stringify({
						provider: config.provider,
						displayName: PROVIDER_DISPLAY_NAMES[config.provider],
						error: message,
					}),
					id: `error-${config.provider}`,
				});
			}
		});

		await Promise.all(promises);

		// All stories done, start judging
		await stream.writeSSE({
			event: 'judging',
			data: JSON.stringify({
				message: 'All stories complete, judge evaluating...',
			}),
			id: 'judging',
		});

		try {
			const { object: judgment } = await generateObject({
				model: JUDGE_MODEL,
				schema: JudgmentSchema,
				prompt: getJudgePrompt(results, FIXED_TONE, FIXED_PROMPT),
			});

			c.var.logger?.info('Judge completed', { winner: judgment.winner });

			await stream.writeSSE({
				event: 'complete',
				data: JSON.stringify({
					id: sessionId,
					judgment: {
						...judgment,
						winnerDisplayName: PROVIDER_DISPLAY_NAMES[judgment.winner],
					},
				}),
				id: 'complete',
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			c.var.logger?.error('Judge failed', { error: message });

			await stream.writeSSE({
				event: 'error',
				data: JSON.stringify({ error: `Judge failed: ${message}` }),
				id: 'judge-error',
			});
		}
	})
);

export default router;
