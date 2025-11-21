import { type PatchModule, generateEnvGuard, generateGatewayEnvGuard } from './_util';

function registerLLMPatch(
	patches: Map<string, PatchModule>,
	module: string,
	filename: string,
	key: string,
	baseurl: string,
	name: string
) {
	patches.set(module, {
		module,
		filename,
		body: {
			before: generateEnvGuard(
				key,
				generateGatewayEnvGuard(key, 'process.env.AGENTUITY_SDK_KEY', baseurl, name)
			),
		},
	});
}

export function generatePatches(): Map<string, PatchModule> {
	const patches = new Map<string, PatchModule>();
	registerLLMPatch(
		patches,
		'@anthropic-ai',
		'index',
		'ANTHROPIC_API_KEY',
		'ANTHROPIC_BASE_URL',
		'anthropic'
	);
	registerLLMPatch(patches, 'groq-sdk', 'index', 'GROQ_API_KEY', 'GROQ_BASE_URL', 'groq');
	registerLLMPatch(patches, 'openai', 'index', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'openai');
	return patches;
}
