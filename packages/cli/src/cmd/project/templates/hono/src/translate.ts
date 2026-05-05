// @agentuity:imports
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// @agentuity:module

export interface TranslateInput {
	text: string;
	toLanguage: string;
	model: string;
}

export interface TranslateResult {
	translation: string;
	tokens: number;
	model: string;
	toLanguage: string;
	/** Set by services that may serve cached results (e.g. database). */
	cached?: boolean;
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
	// @agentuity:translate-pre

	const { text: translation, usage } = await generateText({
		model: openai(input.model),
		prompt: `Translate the following text to ${input.toLanguage}. Return only the translation, nothing else.\n\n${input.text}`,
	});

	const result: TranslateResult = {
		translation,
		tokens: usage?.totalTokens ?? 0,
		model: input.model,
		toLanguage: input.toLanguage,
	};

	// @agentuity:translate-post

	return result;
}
