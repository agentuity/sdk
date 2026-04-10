/**
 * Server function that calls an AI model via the Agentuity AI Gateway.
 *
 * When running under `agentuity dev`, the OPENAI_API_KEY and OPENAI_BASE_URL
 * environment variables are automatically injected so the AI SDK routes
 * through the Agentuity gateway — no separate API keys needed.
 *
 * The 'use server' directive marks this as a server function that TanStack
 * Start's Vite plugin will transform into an RPC endpoint.
 */
'use server';

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function translateText(input: { text: string; toLanguage: string; model?: string }) {
	const { text, toLanguage, model = 'gpt-4o-mini' } = input;

	const { text: translation, usage } = await generateText({
		model: openai(model),
		prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
	});

	return {
		translation,
		tokens: usage?.totalTokens ?? 0,
		model,
		toLanguage,
	};
}
