/**
 * Model Arena Types
 *
 * TypeScript types and Zod schemas for story generation and LLM judge evaluation.
 * Uses Zod for AI SDK's generateObject() which requires Zod schemas.
 */
import { z } from 'zod';

// Tone options for story generation
export type Tone = 'whimsical' | 'sci-fi' | 'suspenseful' | 'comedic';

export const TONE_LABELS: Record<Tone, string> = {
	whimsical: 'Whimsical',
	'sci-fi': 'Sci-fi',
	suspenseful: 'Suspenseful',
	comedic: 'Comedic',
};

// Provider names for consistent typing
export const PROVIDERS = ['openai', 'anthropic'] as const;
export type Provider = (typeof PROVIDERS)[number];

// Display names for UI (proper capitalization)
export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
	openai: 'OpenAI',
	anthropic: 'Anthropic',
};

// Model result from generation
export interface ModelResult {
	provider: Provider;
	model: string;
	story: string;
	generationMs: number;
	tokens: number;
}

// Zod schemas for AI SDK generateObject
export const ProviderScoreSchema = z.object({
	provider: z.enum(PROVIDERS).describe('The provider being scored: openai or anthropic.'),
	score: z.number().describe('Normalized score between 0.0 and 1.0.'),
	reason: z.string().describe('Brief explanation for the score.'),
});

export const ProviderBinarySchema = z.object({
	provider: z.enum(PROVIDERS).describe('The provider being checked: openai or anthropic.'),
	passed: z.boolean().describe('Whether the provider passed the check.'),
	reason: z.string().describe('Brief explanation for the pass or fail result.'),
});

export const JudgmentSchema = z.object({
	winner: z.enum(PROVIDERS).describe('Overall winning provider: openai or anthropic.'),
	reasoning: z.string().describe('Short explanation for the overall winner.'),
	scores: z.object({
		creativity: z.array(ProviderScoreSchema).describe('Creativity scores for both providers.'),
		engagement: z.array(ProviderScoreSchema).describe('Engagement scores for both providers.'),
	}),
	checks: z.object({
		toneMatch: z.array(ProviderBinarySchema).describe('Tone-match checks for both providers.'),
		wordCount: z.array(ProviderBinarySchema).describe('Word-count checks for both providers.'),
	}),
});

// TypeScript types inferred from Zod schemas
export type ProviderScore = z.infer<typeof ProviderScoreSchema>;
export type ProviderBinary = z.infer<typeof ProviderBinarySchema>;
export type Judgment = z.infer<typeof JudgmentSchema>;

// Input/output types for the arena
export interface ArenaInput {
	prompt: string;
	tone: Tone;
}

export interface ArenaOutput {
	id: string;
	results: ModelResult[];
	judgment: Judgment;
}
