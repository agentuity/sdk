import { AIGatewayClient, getAIGatewayCompletionText } from '@agentuity/aigateway';
import { NextResponse } from 'next/server';

// One client per worker; safe to reuse across requests.
const gateway = new AIGatewayClient();

export async function POST(request: Request) {
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

	return NextResponse.json({
		translation,
		tokens: usage?.total_tokens ?? 0,
		model,
		toLanguage: body.toLanguage,
	});
}
