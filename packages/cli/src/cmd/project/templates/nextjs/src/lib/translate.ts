// @agentuity:imports
import { AIGatewayClient } from '@agentuity/aigateway';

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function textFromContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((part) => {
			if (typeof part === 'string') return part;
			if (isRecord(part) && typeof part.text === 'string') return part.text;
			return '';
		})
		.join('');
}

function getCompletionText(response: unknown): string {
	if (!isRecord(response)) return '';
	const choices = response.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const first = choices[0];
		if (isRecord(first)) {
			const message = first.message;
			if (isRecord(message)) {
				const messageText = textFromContent(message.content);
				if (messageText) return messageText;
			}
			const choiceText = textFromContent(first.text);
			if (choiceText) return choiceText;
		}
	}
	return textFromContent(response.content);
}

function getTokenCount(response: unknown): number {
	if (!isRecord(response) || !isRecord(response.usage)) return 0;
	const totalTokens = response.usage.total_tokens ?? response.usage.totalTokens;
	return typeof totalTokens === 'number' ? totalTokens : 0;
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
	// @agentuity:translate-pre

	const client = new AIGatewayClient();
	const completion = await client.complete({
		model: input.model,
		messages: [
			{
				role: 'user',
				content: `Translate the following text to ${input.toLanguage}. Return only the translation, nothing else.\n\n${input.text}`,
			},
		],
	});

	const result: TranslateResult = {
		translation: getCompletionText(completion),
		tokens: getTokenCount(completion),
		model: input.model,
		toLanguage: input.toLanguage,
	};

	// @agentuity:translate-post

	return result;
}
