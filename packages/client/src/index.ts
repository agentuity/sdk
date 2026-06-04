import {
	buildClientHeaders,
	createServerFetchAdapter,
	type FetchAdapter,
	type Logger,
} from '@agentuity/adapter';
import { getEnv } from '@agentuity/config';
import { createMinimalLogger } from './logger.ts';

export type { Logger } from '@agentuity/adapter';
export { createMinimalLogger } from './logger.ts';

export function isLogger(val: unknown): val is Logger {
	return (
		typeof val === 'object' &&
		val !== null &&
		['info', 'warn', 'error', 'debug', 'trace'].every(
			(m) => typeof (val as Record<string, unknown>)[m] === 'function'
		)
	);
}

export function resolveApiKey(apiKey?: string): string | undefined {
	return apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
}

export function resolveRegion(): string {
	return getEnv('AGENTUITY_REGION') ?? 'usc';
}

export function resolveServiceUrl(options: {
	url?: string;
	envKey: string;
	fallback: string;
}): string {
	return options.url || getEnv(options.envKey) || options.fallback;
}

export interface ServiceAdapterOptions {
	apiKey?: string;
	orgId?: string;
	logger?: Logger;
}

export function createServiceAdapter(options: ServiceAdapterOptions = {}): {
	adapter: FetchAdapter;
	logger: Logger;
} {
	const logger = options.logger ?? createMinimalLogger();
	const headers = buildClientHeaders({
		apiKey: resolveApiKey(options.apiKey),
		orgId: options.orgId,
	});
	return {
		adapter: createServerFetchAdapter({ headers }, logger),
		logger,
	};
}
