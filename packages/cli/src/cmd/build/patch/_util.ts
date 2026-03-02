export interface PatchFunctionAction {
	before?: string;
	after?: string;
}

export interface PatchClassAction {
	methods: Record<string, PatchFunctionAction>;
}

export interface PatchModule {
	module: string;
	filename?: string;
	functions?: Record<string, PatchFunctionAction>;
	classes?: Record<string, PatchClassAction>;
	body?: PatchFunctionAction;
}

export function generateEnvWarning(envkey: string): string {
	return `if (process.env.AGENTUITY_ENVIRONMENT === 'development' || process.env.NODE_ENV !== 'production') {
      console.error('[ERROR] No credentials found for this AI provider. To fix this, either:');
      console.error('  1. Login to Agentuity Cloud (agentuity auth login) to use the AI Gateway (recommended)');
      console.error('  2. Set ${envkey} in your .env file to use the provider directly');
     } else {
      console.error('[ERROR] The environment variable ${envkey} is required. Either:');
      console.error('  1. Use Agentuity Cloud AI Gateway by ensuring AGENTUITY_SDK_KEY is configured');
      console.error('  2. Set ${envkey} using "agentuity env set ${envkey}" and redeploy');
     }
`;
}

export function generateJSArgsPatch(index: number, inject: string): string {
	return `const _newargs = [...(_args ?? [])];
_newargs[${index}] = {..._newargs[${index}], ${inject}};
_args = _newargs;`;
}

export function generateEnvGuard(name: string, inject: string, alt?: string): string {
	return `if (!process.env.${name} || process.env.${name}  ===  process.env.AGENTUITY_SDK_KEY) {
${inject}
} else {
	${alt ?? ''}}`;
}

export function generateGatewayEnvGuard(
	apikey: string,
	_apikeyval: string,
	apibase: string,
	provider: string
): string {
	return `{
    const _agentuity_sdk_key = process.env.AGENTUITY_SDK_KEY;
    const _agentuity_url = process.env.AGENTUITY_AIGATEWAY_URL || process.env.AGENTUITY_TRANSPORT_URL || (_agentuity_sdk_key ? 'https://agentuity.ai' : '');
    if (_agentuity_url && _agentuity_sdk_key) {
        process.env.${apikey} = _agentuity_sdk_key;
        process.env.${apibase} = _agentuity_url + '/gateway/${provider}';
        console.debug('Enabled Agentuity AI Gateway for ${provider}');
    } else if (!process.env.${apikey}) {
     ${generateEnvWarning(apikey)}
    }
}
`;
}

export function searchBackwards(contents: string, offset: number, val: string): number {
	for (let i = offset; i >= 0; i--) {
		if (contents.charAt(i) === val) {
			return i;
		}
	}
	return -1;
}
