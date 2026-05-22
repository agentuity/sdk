import { AIGatewayClient } from '@agentuity/aigateway';
import { json, type RequestHandler } from '@sveltejs/kit';

// One client per worker; safe to reuse across requests.
const gateway = new AIGatewayClient();

export const POST: RequestHandler = async ({ request }) => {
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

	const choice = (completion.choices?.[0] ?? {}) as {
		message?: { content?: string };
	};
	const translation = choice.message?.content ?? '';
	const usage = completion.usage as { total_tokens?: number } | undefined;

	return json({
		translation,
		tokens: usage?.total_tokens ?? 0,
		model,
		toLanguage: body.toLanguage,
	});
};
