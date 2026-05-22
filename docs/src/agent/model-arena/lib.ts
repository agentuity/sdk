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

async function repairJudgmentText({ text }: { text: string }): Promise<string | null> {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	return text.slice(start, end + 1);
}

export const MODELS: GenerationConfig[] = [
	{ provider: 'openai', model: 'gpt-5.4-mini' },
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
	tone: Tone,
	abortSignal?: AbortSignal
): Promise<ModelResult> {
	const start = Date.now();

	const { text, usage } = await generateText({
		model: getModel(config),
		system: getStorySystemPrompt(tone),
		prompt,
		abortSignal,
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
	prompt: string,
	abortSignal?: AbortSignal
): Promise<Judgment> {
	const { object } = await generateObject({
		model: getJudgeModel(),
		schema: JudgmentSchema,
		schemaName: 'ModelArenaJudgment',
		schemaDescription:
			'Structured judgment comparing the OpenAI and Anthropic stories with scores, checks, and a winner.',
		temperature: 0,
		experimental_repairText: repairJudgmentText,
		prompt: getJudgePrompt([...results], tone, prompt),
		abortSignal,
	});

	return object;
}
