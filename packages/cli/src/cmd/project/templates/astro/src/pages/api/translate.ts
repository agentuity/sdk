import type { APIRoute } from 'astro';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const POST: APIRoute = async ({ request }) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();

	const { text: translation, usage } = await generateText({
		model: openai(model),
		prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
	});

	return new Response(
		JSON.stringify({
			translation,
			tokens: usage?.totalTokens ?? 0,
			model,
			toLanguage,
		}),
		{ headers: { 'Content-Type': 'application/json' } },
	);
};
