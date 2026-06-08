import { StructuredError } from '@agentuity/core';
import { createGroq } from '@ai-sdk/groq';

const AIGatewayConfigError = StructuredError('AIGatewayConfigError');

interface ProviderConfig {
	apiKeyEnv: string;
	baseUrlEnv: string;
	name: string;
}

// Factory-style AI SDK providers do not all read base URL env vars by default,
// so pass the provider env that Agentuity dev/sandbox wiring supplies.
function requireProviderConfig(config: ProviderConfig): { apiKey: string; baseUrl: string } {
	const apiKey = process.env[config.apiKeyEnv];
	const rawBaseUrl = process.env[config.baseUrlEnv];
	const baseUrl = rawBaseUrl?.replace(/\/+$/u, '');

	if (!apiKey) {
		throw new AIGatewayConfigError({
			message: `${config.apiKeyEnv} is required for ${config.name} AI Gateway access`,
		});
	}

	if (!baseUrl) {
		throw new AIGatewayConfigError({
			message: `${config.baseUrlEnv} is required for ${config.name} AI Gateway access`,
		});
	}

	return { apiKey, baseUrl };
}

export function createGroqProvider() {
	const { apiKey, baseUrl } = requireProviderConfig({
		apiKeyEnv: 'GROQ_API_KEY',
		baseUrlEnv: 'GROQ_BASE_URL',
		name: 'Groq',
	});

	return createGroq({
		apiKey,
		baseURL: baseUrl,
	});
}
