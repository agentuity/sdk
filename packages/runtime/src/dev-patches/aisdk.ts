/**
 * Runtime AI SDK patches for dev mode.
 *
 * Replaces the build-time patches from cli/src/cmd/build/patch/aisdk.ts.
 * Monkey-patches Vercel AI SDK functions to:
 * 1. Enable experimental telemetry on all AI function calls
 * 2. Route AI SDK provider factory functions through the AI Gateway
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function warnMissingKey(envKey: string): void {
	const isDev =
		process.env.AGENTUITY_ENVIRONMENT === 'development' || process.env.NODE_ENV !== 'production';

	// Align no-bundle runtime behavior with historical build-time expectations:
	// in development, don't emit eager startup errors for every provider.
	if (isDev) {
		return;
	}

	console.error(`[ERROR] The environment variable ${envKey} is required. Either:`);
	console.error('  1. Use Agentuity Cloud AI Gateway by ensuring AGENTUITY_SDK_KEY is configured');
	console.error(`  2. Set ${envKey} using "agentuity env set ${envKey}" and redeploy`);
}

/**
 * Wrap an AI SDK function to inject experimental_telemetry: { isEnabled: true }.
 */
function wrapWithTelemetry(originalFn: (...args: any[]) => any): (...args: any[]) => any {
	return function (this: any, ...args: any[]) {
		const opts = { ...(args[0] ?? {}) };
		opts.experimental_telemetry = { isEnabled: true };
		args[0] = opts;
		return originalFn.apply(this, args);
	};
}

/**
 * Wrap a provider factory function (e.g., createOpenAI) to inject gateway config.
 */
function wrapProviderFactory(
	originalFn: (...args: any[]) => any,
	envKey: string,
	provider: string
): (...args: any[]) => any {
	return function (this: any, ...args: any[]) {
		const currentKey = process.env[envKey];
		const sdkKey = process.env.AGENTUITY_SDK_KEY;

		// If user provided their own key (and it's not the SDK key), leave it alone
		if (currentKey && currentKey !== sdkKey) {
			if (!sdkKey) {
				console.log(
					`User provided ${provider} api key set. Use the Agentuity AI Gateway more features.`
				);
			}
			return originalFn.apply(this, args);
		}

		// Route through gateway
		const transportUrl = process.env.AGENTUITY_TRANSPORT_URL;
		if (transportUrl && sdkKey) {
			const opts = { ...(args[0] ?? {}) };
			if (!opts.baseURL) {
				opts.apiKey = sdkKey;
				opts.baseURL = `${transportUrl}/gateway/${provider}`;
				args[0] = opts;
			}
		} else if (!currentKey) {
			warnMissingKey(envKey);
		}

		return originalFn.apply(this, args);
	};
}

/** AI SDK core functions to wrap with telemetry injection */
const AI_CORE_FUNCTIONS = [
	'generateText',
	'streamText',
	'generateObject',
	'streamObject',
	'embed',
	'embedMany',
] as const;

/** AI SDK provider packages and their factory functions */
const AI_PROVIDER_CONFIGS = [
	{
		module: '@ai-sdk/openai',
		factory: 'createOpenAI',
		envKey: 'OPENAI_API_KEY',
		provider: 'openai',
	},
	{
		module: '@ai-sdk/anthropic',
		factory: 'createAnthropic',
		envKey: 'ANTHROPIC_API_KEY',
		provider: 'anthropic',
	},
	{
		module: '@ai-sdk/cohere',
		factory: 'createCohere',
		envKey: 'COHERE_API_KEY',
		provider: 'cohere',
	},
	{
		module: '@ai-sdk/deepseek',
		factory: 'createDeepSeek',
		envKey: 'DEEPSEEK_API_KEY',
		provider: 'deepseek',
	},
	{
		module: '@ai-sdk/google',
		factory: 'createGoogleGenerativeAI',
		envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
		provider: 'google-ai-studio',
	},
	{ module: '@ai-sdk/xai', factory: 'createXai', envKey: 'XAI_API_KEY', provider: 'grok' },
	{ module: '@ai-sdk/groq', factory: 'createGroq', envKey: 'GROQ_API_KEY', provider: 'groq' },
	{
		module: '@ai-sdk/mistral',
		factory: 'createMistral',
		envKey: 'MISTRAL_API_KEY',
		provider: 'mistral',
	},
	{
		module: '@ai-sdk/perplexity',
		factory: 'createPerplexity',
		envKey: 'PERPLEXITY_API_KEY',
		provider: 'perplexity-ai',
	},
] as const;

/**
 * Patch AI SDK core functions (generateText, streamText, etc.) with telemetry injection.
 */
export async function applyAISDKCorePatches(): Promise<void> {
	try {
		const aiModule = await import('ai');

		for (const fnName of AI_CORE_FUNCTIONS) {
			const original = (aiModule as any)[fnName];
			if (typeof original === 'function') {
				(aiModule as any)[fnName] = wrapWithTelemetry(original);
			}
		}
	} catch {
		// 'ai' package not installed — skip
	}
}

/**
 * Patch AI SDK provider factory functions to route through the AI Gateway.
 */
export async function applyAISDKProviderPatches(): Promise<void> {
	for (const config of AI_PROVIDER_CONFIGS) {
		try {
			const mod = await import(config.module);
			const original = mod[config.factory];
			if (typeof original === 'function') {
				mod[config.factory] = wrapProviderFactory(original, config.envKey, config.provider);
			}
		} catch {
			// Provider package not installed — skip
		}
	}
}
