import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { data } from 'react-router';
import type { Route } from './+types/api.translate';

export async function action({ request }: Route.ActionArgs) {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();

	try {
		const { text: translation, usage } = await generateText({
			model: openai(model),
			prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
		});

		return data({
			translation,
			tokens: usage?.totalTokens ?? 0,
			model,
			toLanguage,
		});
	} catch (error) {
		throw data({ message: error instanceof Error ? error.message : 'Translation failed' }, { status: 500 });
	}
}
