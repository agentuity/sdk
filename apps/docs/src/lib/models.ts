import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { createGoogleProvider, createGroqProvider } from './ai-gateway';

// Helper to get the appropriate model based on model ID
export function getModel(modelId: string): LanguageModel {
	if (modelId.startsWith('claude-')) {
		return anthropic(modelId);
	}
	if (modelId.startsWith('gemini-')) {
		return createGoogleProvider()(modelId);
	}
	if (modelId.startsWith('llama-') || modelId.startsWith('mixtral-')) {
		return createGroqProvider()(modelId);
	}
	// Default to OpenAI
	return openai(modelId);
}
