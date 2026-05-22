import { AIGatewayClient } from '@agentuity/aigateway';
import { createFileRoute } from '@tanstack/react-router';

// One client per worker; safe to reuse across requests.
// The gateway requires an orgId header in addition to the SDK key. Other
// service clients in the SDK take it as a constructor option only — pick
// it up here from any of the env var names the platform already uses so
// `agentuity dev` (which injects AGENTUITY_ORGID from agentuity.json) and
// CI (which sets AGENTUITY_ORG_ID) both work.
// Tracked at agentuity/infra#483 — if/when the gateway accepts SDK-key-only
// auth on this route, the orgId option here becomes optional.
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
