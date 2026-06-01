import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { createGoogleProvider, createGroqProvider } from './ai-gateway';

function stripProvider(modelId: string, provider: string): string {
	const prefix = `${provider}/`;
	return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

// Accept Gateway catalog IDs where possible, then adapt them to the provider SDK.
export function getModel(modelId: string): LanguageModel {
	if (modelId.startsWith('anthropic/') || modelId.startsWith('claude-')) {
		return anthropic(stripProvider(modelId, 'anthropic'));
	}
	if (modelId.startsWith('googleai/') || modelId.startsWith('gemini-')) {
		return createGoogleProvider()(stripProvider(modelId, 'googleai'));
	}
	if (
		modelId.startsWith('groq/') ||
		modelId.startsWith('llama-') ||
		modelId.startsWith('mixtral-')
	) {
		return createGroqProvider()(stripProvider(modelId, 'groq'));
	}
	if (modelId.startsWith('openai/') || modelId.startsWith('gpt-')) {
		return openai(stripProvider(modelId, 'openai'));
	}

	throw new Error(`Unsupported model id: ${modelId}`);
}
