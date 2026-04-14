import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();

	const { text: translation, usage } = await generateText({
		model: openai(model),
		prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
	});

	return NextResponse.json({
		translation,
		tokens: usage?.totalTokens ?? 0,
		model,
		toLanguage,
	});
}
