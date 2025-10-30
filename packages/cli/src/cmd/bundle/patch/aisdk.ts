import {
	type PatchModule,
	generateEnvWarning,
	generateEnvGuard,
	generateJSArgsPatch,
} from './_util';

function generateAISDKPatch(patches: Map<string, PatchModule>) {
	const vercelTelemetryPatch = generateJSArgsPatch(0, ` ` + '');

	const enableTelemetryPatch = `
		// Enable experimental telemetry to capture response text
		const opts = {...(_args[0] ?? {}) };
		opts.experimental_telemetry = { isEnabled: true };
		_args[0] = opts;
		`;

	const comboPatch = vercelTelemetryPatch + enableTelemetryPatch;
	const functionPatch = { before: comboPatch };

	const patch: PatchModule = {
		module: 'ai',
		functions: {
			generateText: functionPatch,
			streamText: functionPatch,
			generateObject: functionPatch,
			streamObject: functionPatch,
			embed: functionPatch,
			embedMany: functionPatch,
		},
	};
	patches.set('@vercel/ai', patch);
}

export function generatePatches(): Map<string, PatchModule> {
	const patches = new Map<string, PatchModule>();
	generateAISDKPatch(patches);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/openai',
		'createOpenAI',
		'OPENAI_API_KEY',
		'openai'
	);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/anthropic',
		'createAnthropic',
		'ANTHROPIC_API_KEY',
		'anthropic'
	);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/cohere',
		'createCohere',
		'COHERE_API_KEY',
		'cohere'
	);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/deepseek',
		'createDeepSeek',
		'DEEPSEEK_API_KEY',
		'deepseek'
	);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/google',
		'createGoogleGenerativeAI',
		'GOOGLE_GENERATIVE_AI_API_KEY',
		'google-ai-studio'
	);
	createVercelAIProviderPatch(patches, '@ai-sdk/xai', 'createXai', 'XAI_API_KEY', 'grok');
	createVercelAIProviderPatch(patches, '@ai-sdk/groq', 'createGroq', 'GROQ_API_KEY', 'groq');
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/mistral',
		'createMistral',
		'MISTRAL_API_KEY',
		'mistral'
	);
	createVercelAIProviderPatch(
		patches,
		'@ai-sdk/perplexity',
		'createPerplexity',
		'PERPLEXITY_API_KEY',
		'perplexity-ai'
	);
	return patches;
}

function generateVercelAIProvider(name: string, envkey: string): string {
	return (
		generateJSArgsPatch(0, '') +
		`const opts = {...(_args[0] ?? {}) };
if (!opts.baseURL) {
	const apikey = process.env.AGENTUITY_SDK_KEY;
	const url = process.env.AGENTUITY_TRANSPORT_URL;
	if (url && apikey) {
		opts.apiKey = apikey;
		opts.baseURL = url + '/gateway/${name}';
		_args[0] = opts;
	} else {
	  ${generateEnvWarning(envkey)}
	}
}`
	);
}

function createVercelAIProviderPatch(
	patches: Map<string, PatchModule>,
	module: string,
	createFn: string,
	envkey: string,
	provider: string
) {
	const patch = {
		module: module,
		functions: {
			[createFn]: {
				before: generateEnvGuard(
					envkey,
					generateVercelAIProvider(provider, envkey),
					`console.log("User provided API Key set for ${provider}. Switch to Agentuity AI Gateway for better logs, metrics and billing.");`
				),
			},
		},
	};
	patches.set(module, patch);
}
