import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const text = formData.get('text') as string;
		const toLanguage = formData.get('toLanguage') as string;
		const model = (formData.get('model') as string) || 'gpt-4o-mini';

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
	},
};
