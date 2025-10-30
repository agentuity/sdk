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
      console.error('The required environment variable ${envkey} must be set in your project .env file or in your local system environment.');
     } else {
      console.error('The required environment variable ${envkey} is required for this project. Use "agentuity env set ${envkey}" to set it and redeploy your project.');
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
	apikeyval: string,
	apibase: string,
	provider: string
): string {
	return `{
    const apikey = process.env.AGENTUITY_SDK_KEY;
    const url = process.env.AGENTUITY_AIGATEWAY_URL || process.env.AGENTUITY_TRANSPORT_URL || (apikey ? 'https://agentuity.ai' : '');
    if (url && apikey) {
        process.env.${apikey} = ${apikeyval};
        process.env.${apibase} = url + '/gateway/${provider}';
        console.debug('Enabled Agentuity AI Gateway for ${provider}');
    } else {
     ${generateEnvWarning(apikey)}
    }
}
`;
}

export function searchBackwards(contents: string, offset: number, val: string): number {
	for (let i = offset; i >= 0; i--) {
		if (contents.charAt(i) == val) {
			return i;
		}
	}
	return -1;
}
