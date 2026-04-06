/**
 * Runtime LLM Gateway patches for dev mode.
 *
 * Replaces the build-time patches from cli/src/cmd/build/patch/llm.ts.
 * Sets environment variables to route LLM SDK calls through the Agentuity AI Gateway
 * when the user hasn't provided their own API keys.
 */

interface GatewayConfig {
	apiKeyEnv: string;
	baseUrlEnv: string;
	provider: string;
}

const GATEWAY_CONFIGS: GatewayConfig[] = [
	{ apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL', provider: 'anthropic' },
	{ apiKeyEnv: 'GROQ_API_KEY', baseUrlEnv: 'GROQ_BASE_URL', provider: 'groq' },
	{ apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', provider: 'openai' },
];

function warnMissingKey(envKey: string): void {
	const isDev =
		process.env.AGENTUITY_ENVIRONMENT === 'development' || process.env.NODE_ENV !== 'production';

	// Align no-bundle runtime behavior with historical build-time expectations:
	// in development, don't emit eager startup errors for every provider.
	// Missing credentials should surface when/if that provider is actually used.
	if (isDev) {
		return;
	}

	console.error(`[ERROR] The environment variable ${envKey} is required. Either:`);
	console.error('  1. Use Agentuity Cloud AI Gateway by ensuring AGENTUITY_SDK_KEY is configured');
	console.error(`  2. Set ${envKey} using "agentuity env set ${envKey}" and redeploy`);
}

/**
 * Set environment variables to route LLM calls through the AI Gateway.
 *
 * For each provider, if the user hasn't set their own API key (or it equals
 * the SDK key), we redirect to the gateway. This matches the behavior of
 * the build-time patches in patch/llm.ts.
 */
export function applyGatewayPatches(): void {
	const sdkKey = process.env.AGENTUITY_SDK_KEY;
	const gatewayUrl =
		process.env.AGENTUITY_AIGATEWAY_URL ||
		process.env.AGENTUITY_TRANSPORT_URL ||
		(sdkKey ? 'https://catalyst.agentuity.cloud' : '');

	for (const config of GATEWAY_CONFIGS) {
		const currentKey = process.env[config.apiKeyEnv];

		// If the user provided their own key (and it's not the SDK key), leave it alone
		if (currentKey && currentKey !== sdkKey) {
			continue;
		}

		// Route through gateway if we have both URL and SDK key
		if (gatewayUrl && sdkKey) {
			process.env[config.apiKeyEnv] = sdkKey;
			process.env[config.baseUrlEnv] = `${gatewayUrl}/gateway/${config.provider}`;
			console.debug(`Enabled Agentuity AI Gateway for ${config.provider}`);
		} else if (!currentKey) {
			warnMissingKey(config.apiKeyEnv);
		}
	}
}
