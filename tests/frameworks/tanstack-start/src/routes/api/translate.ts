import { AIGatewayClient, getAIGatewayCompletionText } from '@agentuity/aigateway';
import { createFileRoute } from '@tanstack/react-router';

// One client per worker; safe to reuse across requests.
// Unlinked demo projects use CLI-key fallback, and that auth path still needs
// an org header. Read the env var names used by local linked projects and CI.
const gateway = new AIGatewayClient({
	orgId:
		process.env.AGENTUITY_ORGID ??
		process.env.AGENTUITY_ORG_ID ??
		process.env.AGENTUITY_CLOUD_ORG_ID,
});

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

				const translation = getAIGatewayCompletionText(completion);
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
