/**
 * Model Arena Shared Utilities
 *
 * Common configuration and functions used by both the agent and route.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { createGroqProvider } from '../../lib/ai-gateway';
import { getJudgePrompt, getStorySystemPrompt } from './prompts';
import { JudgmentSchema } from './types';
import type { Judgment, ModelResult, Provider, Tone } from './types';

export interface GenerationConfig {
	provider: Provider;
	model: string;
}

export const MODELS: GenerationConfig[] = [
	{ provider: 'openai', model: 'gpt-5-nano' },
	{ provider: 'anthropic', model: 'claude-haiku-4-5' },
];

// Using GPT-OSS 120B via Groq for fast judging with structured outputs
export const getJudgeModel = () => createGroqProvider()('openai/gpt-oss-120b');

export function getModel(config: GenerationConfig) {
	switch (config.provider) {
		case 'openai':
			return openai(config.model);
		case 'anthropic':
			return anthropic(config.model);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}

export async function generateStory(
	config: GenerationConfig,
	prompt: string,
	tone: Tone
): Promise<ModelResult> {
	const start = Date.now();

	const { text, usage } = await generateText({
		model: getModel(config),
		system: getStorySystemPrompt(tone),
		prompt,
	});

	return {
		provider: config.provider,
		model: config.model,
		story: text,
		generationMs: Date.now() - start,
		tokens: usage?.totalTokens ?? 0,
	};
}

export async function judgeStories(
	results: ReadonlyArray<ModelResult>,
	tone: Tone,
	prompt: string
): Promise<Judgment> {
	const { object } = await generateObject({
		model: getJudgeModel(),
		schema: JudgmentSchema,
		prompt: getJudgePrompt([...results], tone, prompt),
	});

	return object;
}
