import { AIGatewayClient } from '@agentuity/aigateway';
import { createFileRoute } from '@tanstack/react-router';

// One client per worker; safe to reuse across requests.
const gateway = new AIGatewayClient();

export const Route = createFileRoute('/api/translate')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json()) as {
					text: string;
					toLanguage: string;
					model?: string;
				};

				const model = body.model ?? 'openai/gpt-4o-mini';

				const completion = await gateway.complete({
					model,
					messages: [
						{
							role: 'user',
							content: `Translate the following text to ${body.toLanguage}. Return only the translation, nothing else.\n\n${body.text}`,
						},
					],
				});

				// The gateway returns an OpenAI-shaped response. Pull the assistant text
				// out of the first choice and surface token usage when present.
				const choice = (completion.choices?.[0] ?? {}) as {
					message?: { content?: string };
				};
				const translation = choice.message?.content ?? '';
				const usage = completion.usage as { total_tokens?: number } | undefined;

				return new Response(
					JSON.stringify({
						translation,
						tokens: usage?.total_tokens ?? 0,
						model,
						toLanguage: body.toLanguage,
					}),
					{ headers: { 'Content-Type': 'application/json' } }
				);
			},
		},
	},
});
