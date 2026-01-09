/**
 * Model Arena Shared Utilities
 *
 * Common configuration and functions used by both the agent and route.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { getStorySystemPrompt } from './prompts';
import type { ModelResult, Provider, Tone } from './types';

export interface GenerationConfig {
	provider: Provider;
	model: string;
}

export const MODELS: GenerationConfig[] = [
	{ provider: 'openai', model: 'gpt-5-nano' },
	{ provider: 'anthropic', model: 'claude-haiku-4-5' },
];

// Using GPT-OSS 120B via Groq for fast judging with structured outputs
export const JUDGE_MODEL = groq('openai/gpt-oss-120b');

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
