/**
 * Model Arena Agent
 *
 * Compares AI model outputs using LLM-as-judge evaluation. This demonstrates
 * using multiple AI providers through the gateway and structured output with
 * generateObject() for the judge's scoring.
 *
 * Pattern shown:
 * 1. Generate content from multiple providers in parallel (OpenAI, Anthropic)
 * 2. Use a fast model (Groq) as judge with strict JSON schema output
 * 3. Score on multiple dimensions (creativity, engagement, tone, word count)
 *
 * The judge uses generateObject() with a Zod schema for type-safe structured
 * output - the model is forced to return valid JSON matching your schema.
 *
 * Docs: https://preview.agentuity.dev/v1/Build/Agents/schema-libraries
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { generateObject } from 'ai';
import { generateStory, JUDGE_MODEL, MODELS } from './lib';
import { getJudgePrompt } from './prompts';
import { type Judgment, JudgmentSchema, type ModelResult, type Tone } from './types';

async function judgeStories(results: ModelResult[], tone: Tone, prompt: string): Promise<Judgment> {
	const { object } = await generateObject({
		model: JUDGE_MODEL,
		schema: JudgmentSchema,
		prompt: getJudgePrompt(results, tone, prompt),
	});

	return object;
}

const agent = createAgent('model-arena', {
	description: 'Compare short stories from multiple AI models with LLM-as-judge evaluation',
	schema: {
		input: s.object({
			prompt: s.string(),
			tone: s.enum(['whimsical', 'sci-fi', 'suspenseful', 'comedic']),
		}),
		output: s.object({
			id: s.string(),
			results: s.array(
				s.object({
					provider: s.enum(['openai', 'anthropic']),
					model: s.string(),
					story: s.string(),
					generationMs: s.number(),
				})
			),
			judgment: s.object({
				winner: s.enum(['openai', 'anthropic']),
				reasoning: s.string(),
				scores: s.object({
					creativity: s.array(
						s.object({
							provider: s.enum(['openai', 'anthropic']),
							score: s.number(),
							reason: s.string(),
						})
					),
					engagement: s.array(
						s.object({
							provider: s.enum(['openai', 'anthropic']),
							score: s.number(),
							reason: s.string(),
						})
					),
				}),
				checks: s.object({
					toneMatch: s.array(
						s.object({
							provider: s.enum(['openai', 'anthropic']),
							passed: s.boolean(),
							reason: s.string(),
						})
					),
					wordCount: s.array(
						s.object({
							provider: s.enum(['openai', 'anthropic']),
							passed: s.boolean(),
							reason: s.string(),
						})
					),
				}),
			}),
		}),
	},
	handler: async (ctx, input) => {
		const id = ctx.sessionId;

		ctx.logger.info('Model Arena starting', {
			prompt: input.prompt,
			tone: input.tone,
			sessionId: id,
		});

		// Run all 3 models in parallel
		const results = await Promise.all(
			MODELS.map((config) => generateStory(config, input.prompt, input.tone))
		);

		ctx.logger.info('All models completed, running judge', {
			providers: results.map((r) => r.provider),
			times: results.map((r) => r.generationMs),
		});

		// Run LLM judge to compare stories
		const judgment = await judgeStories(results, input.tone, input.prompt);

		ctx.logger.info('Judge completed', {
			winner: judgment.winner,
			creativityProviders: judgment.scores.creativity.map((s) => s.provider),
		});

		return { id, results, judgment };
	},
});

export default agent;
