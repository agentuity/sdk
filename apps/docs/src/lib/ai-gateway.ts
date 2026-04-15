import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

// AI SDK convenience exports are created eagerly with their upstream base URLs
// Use explicit factories here until DevMode rewires those exports reliably
function requireGatewayConfig(): { apiKey: string; baseUrl: string } {
	const apiKey = process.env.AGENTUITY_SDK_KEY;
	const baseUrl = process.env.AGENTUITY_TRANSPORT_URL || process.env.AGENTUITY_CATALYST_URL;

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
