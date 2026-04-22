import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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

	return NextResponse.json({
		translation,
		tokens: usage?.totalTokens ?? 0,
		model,
		toLanguage: body.toLanguage,
	});
}
