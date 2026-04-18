import { json, type RequestHandler } from '@sveltejs/kit';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		text: string;
		toLanguage: string;
		model?: string;
	};

	const model = body.model ?? 'gpt-4o-mini';

	const { text: translation, usage } = await generateText({
		model: openai(model),
		prompt: `Translate the following text to ${body.toLanguage}. Return only the translation, nothing else.\n\n${body.text}`,
	});

	return json({
		translation,
		tokens: usage?.totalTokens ?? 0,
		model,
		toLanguage: body.toLanguage,
	});
};
