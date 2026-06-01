/**
 * Model Arena Shared Utilities
 *
 * Common configuration and functions used by both the agent and route.
 */
import { generateObject, generateText } from 'ai';
import { createGroqProvider } from '../../lib/ai-gateway';
import { getModel as getGatewayModel } from '../../lib/models';
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
	{ provider: 'anthropic', model: 'anthropic/claude-opus-4-8' },
	{ provider: 'google', model: 'googleai/gemini-3.5-flash' },
];

// Using GPT-OSS 120B via Groq for fast judging with structured outputs
export const getJudgeModel = () => createGroqProvider()('openai/gpt-oss-120b');

export function getModel(config: GenerationConfig) {
	return getGatewayModel(config.model);
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
			'Structured judgment comparing the Anthropic and Google stories with scores, checks, and a winner.',
		temperature: 0,
		experimental_repairText: repairJudgmentText,
		prompt: getJudgePrompt([...results], tone, prompt),
		abortSignal,
	});

	return object;
}
