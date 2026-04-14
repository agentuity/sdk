import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export default defineEventHandler(async (event) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await readBody(event);

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
});
