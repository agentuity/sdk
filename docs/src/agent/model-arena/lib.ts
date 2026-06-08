/**
 * Model Arena Shared Utilities
 *
 * Common configuration and functions used by both the agent and route.
 */
import { AIGatewayClient } from '@agentuity/aigateway';
import { getJudgePrompt, getStorySystemPrompt } from './prompts';
import { JudgmentSchema } from './types';
import type { Judgment, ModelResult, Provider, Tone } from './types';

export interface GenerationConfig {
	provider: Provider;
	model: string;
}

const JUDGE_MODEL = 'openai/gpt-5.4-mini';
const gateway = new AIGatewayClient();

const JUDGMENT_RESPONSE_SCHEMA = {
	type: 'object',
	properties: {
		winner: { type: 'string', enum: ['openai', 'anthropic'] },
		reasoning: { type: 'string' },
		scores: {
			type: 'object',
			properties: {
				creativity: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							provider: { type: 'string', enum: ['openai', 'anthropic'] },
							score: { type: 'number' },
							reason: { type: 'string' },
						},
						required: ['provider', 'score', 'reason'],
						additionalProperties: false,
					},
				},
				engagement: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							provider: { type: 'string', enum: ['openai', 'anthropic'] },
							score: { type: 'number' },
							reason: { type: 'string' },
						},
						required: ['provider', 'score', 'reason'],
						additionalProperties: false,
					},
				},
			},
			required: ['creativity', 'engagement'],
			additionalProperties: false,
		},
		checks: {
			type: 'object',
			properties: {
				toneMatch: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							provider: { type: 'string', enum: ['openai', 'anthropic'] },
							passed: { type: 'boolean' },
							reason: { type: 'string' },
						},
						required: ['provider', 'passed', 'reason'],
						additionalProperties: false,
					},
				},
				wordCount: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							provider: { type: 'string', enum: ['openai', 'anthropic'] },
							passed: { type: 'boolean' },
							reason: { type: 'string' },
						},
						required: ['provider', 'passed', 'reason'],
						additionalProperties: false,
					},
				},
			},
			required: ['toneMatch', 'wordCount'],
			additionalProperties: false,
		},
	},
	required: ['winner', 'reasoning', 'scores', 'checks'],
	additionalProperties: false,
};

export const MODELS: GenerationConfig[] = [
	{ provider: 'openai', model: 'openai/gpt-5.4-mini' },
	{ provider: 'anthropic', model: 'anthropic/claude-opus-4-8' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getTotalTokens(completion: unknown): number {
	if (!isRecord(completion) || !isRecord(completion.usage)) {
		return 0;
	}

	const totalTokens = completion.usage.total_tokens ?? completion.usage.totalTokens;
	return typeof totalTokens === 'number' ? totalTokens : 0;
}

export async function generateStory(
	config: GenerationConfig,
	prompt: string,
	tone: Tone,
	abortSignal?: AbortSignal
): Promise<ModelResult> {
	const start = Date.now();
	if (abortSignal?.aborted) {
		throw new Error('Request aborted');
	}

	const result = await gateway.completeText({
		model: config.model,
		messages: [
			{ role: 'system', content: getStorySystemPrompt(tone) },
			{ role: 'user', content: prompt },
		],
	});

	return {
		provider: config.provider,
		model: config.model,
		story: result.text,
		generationMs: Date.now() - start,
		tokens: getTotalTokens(result.completion),
	};
}

export async function judgeStories(
	results: ReadonlyArray<ModelResult>,
	tone: Tone,
	prompt: string,
	abortSignal?: AbortSignal
): Promise<Judgment> {
	if (abortSignal?.aborted) {
		throw new Error('Request aborted');
	}

	const result = await gateway.completeStructured({
		model: JUDGE_MODEL,
		response_schema: {
			name: 'ModelArenaJudgment',
			description:
				'Structured judgment comparing the OpenAI and Anthropic stories with scores, checks, and a winner.',
			schema: JUDGMENT_RESPONSE_SCHEMA,
		},
		temperature: 0,
		messages: [{ role: 'user', content: getJudgePrompt([...results], tone, prompt) }],
	});

	const parsed = JudgmentSchema.safeParse(result.data);
	if (!parsed.success) {
		throw new Error('Judge returned invalid structured output.');
	}

	return parsed.data;
}
