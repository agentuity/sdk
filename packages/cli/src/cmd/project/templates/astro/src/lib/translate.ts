import { AIGatewayClient, getAIGatewayCompletionText } from '@agentuity/aigateway';


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

function getTokenCount(response: unknown): number {
	if (!isRecord(response) || !isRecord(response.usage)) return 0;
	const totalTokens = response.usage.total_tokens ?? response.usage.totalTokens;
	return typeof totalTokens === 'number' ? totalTokens : 0;
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {

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
		translation: getAIGatewayCompletionText(completion),
		tokens: getTokenCount(completion),
		model: input.model,
		toLanguage: input.toLanguage,
	};


	return result;
}
