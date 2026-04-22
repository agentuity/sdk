import { createFileRoute } from '@tanstack/react-router';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const Route = createFileRoute('/api/translate')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.json();
				const {
					text,
					toLanguage,
					model = 'gpt-4o-mini',
				} = body as {
					text: string;
					toLanguage: string;
					model?: string;
				};

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
					{ headers: { 'Content-Type': 'application/json' } }
				);
			},
		},
	},
});
