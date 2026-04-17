import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

// AI SDK convenience exports can miss DevMode gateway routing, so create
// these providers with the Agentuity Gateway URL explicitly.
function requireGatewayConfig(): { apiKey: string; baseUrl: string } {
	const apiKey = process.env.AGENTUITY_SDK_KEY;
	const rawBaseUrl = process.env.AGENTUITY_TRANSPORT_URL || process.env.AGENTUITY_CATALYST_URL;
	const baseUrl = rawBaseUrl?.replace(/\/+$/u, '');

	if (!apiKey) {
		throw new Error('AGENTUITY_SDK_KEY is required for Agentuity AI Gateway access');
	}

	if (!baseUrl) {
		throw new Error(
			'AI Gateway is not configured in this environment. Run via agentuity dev or deploy on Agentuity'
		);
	}

	return { apiKey, baseUrl };
}

export function createGoogleProvider() {
	const { apiKey, baseUrl } = requireGatewayConfig();

	return createGoogleGenerativeAI({
		apiKey,
		baseURL: `${baseUrl}/gateway/google-ai-studio`,
	});
}

export function createGroqProvider() {
	const { apiKey, baseUrl } = requireGatewayConfig();

	return createGroq({
		apiKey,
		baseURL: `${baseUrl}/gateway/groq`,
	});
}
