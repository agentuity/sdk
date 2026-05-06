/**
 * Agentuity AI Gateway Custom Provider Extension
 *
 * Registers models from the Agentuity AI Gateway using the appropriate API type
 * based on model ID patterns. Models are loaded dynamically from the gateway's /models endpoint.
 *
 * Usage:
 *   Use /model to switch to aigateway models
 */
import { delimiter, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createMinimalLogger, StructuredError } from '@agentuity/core';
import {
	AIGatewayService,
	type AIGatewayModel,
	type AIGatewayModels,
} from '@agentuity/core/aigateway';
import { createServerFetchAdapter } from '@agentuity/server';
import type { ExtensionAPI, ProviderModelConfig } from '@mariozechner/pi-coding-agent';

export type KnownApi =
	| 'openai-completions'
	| 'mistral-conversations'
	| 'openai-responses'
	| 'azure-openai-responses'
	| 'openai-codex-responses'
	| 'anthropic-messages'
	| 'bedrock-converse-stream'
	| 'google-generative-ai'
	| 'google-gemini-cli'
	| 'google-vertex';

const KNOWN_APIS = new Set<string>([
	'openai-completions',
	'mistral-conversations',
	'openai-responses',
	'azure-openai-responses',
	'openai-codex-responses',
	'anthropic-messages',
	'bedrock-converse-stream',
	'google-generative-ai',
	'google-gemini-cli',
	'google-vertex',
] satisfies KnownApi[]);

const AIGatewayModelFetchError = StructuredError('AIGatewayModelFetchError')<{
	cause?: unknown;
}>();

function getEnv(...keys: string[]): string | undefined {
	for (const key of keys) {
		if (process.env[key]) {
			return process.env[key];
		}
	}
}

function normalizeCredential(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const normalized = String(value).trim();
	return normalized.length > 0 ? normalized : undefined;
}

function isKnownApi(api: unknown): api is KnownApi {
	return typeof api === 'string' && KNOWN_APIS.has(api);
}

function getRegion(): string {
	return getEnv('AGENTUITY_REGION') ?? 'usc';
}

function getBaseUrl(): string {
	const region = getRegion();
	return `https://aigateway-${region}.agentuity.cloud`;
}

async function fetchModels(): Promise<AIGatewayModels> {
	const baseUrl = getBaseUrl();
	let apiKey = normalizeCredential(
		getEnv(
			'AGENTUITY_CODER_API_KEY',
			'AGENTUITY_SDK_KEY',
			'AGENTUITY_CLI_API_KEY',
			'AGENTUITY_CLI_KEY'
		)
	);
	let orgId = normalizeCredential(
		getEnv('AGENTUITY_ORGID', 'AGENTUITY_CLOUD_ORG_ID', 'AGENTUITY_ORG_ID')
	);

	if (!apiKey) {
		let found = false;
		const path = process.env.PATH?.split(delimiter) ?? [];
		for (const dir of path) {
			const fn = join(dir, 'agentuity');
			if (existsSync(fn)) {
				try {
					const res = execFileSync(fn, ['auth', 'apikey', '--json']);
					const apiKeyResult = JSON.parse(res.toString()) as { apiKey: string };
					apiKey = normalizeCredential(apiKeyResult.apiKey);
					found = true;
					if (!orgId) {
						const ores = execFileSync(fn, ['auth', 'org', 'current']);
						orgId = normalizeCredential(ores);
						if (!orgId) {
							console.warn(
								'Cannot determine the org id. Use `agentuity auth org select` to select a default organization'
							);
							return {};
						}
					}
					break;
				} catch (error) {
					throw new AIGatewayModelFetchError({
						message: 'Failed to fetch models from AI Gateway',
						cause: error,
					});
				}
			}
		}
		if (!found) {
			console.warn(
				'AGENTUITY_SDK_KEY, AGENTUITY_CLI_API_KEY or AGENTUITY_CLI_KEY not set and cannot find the agentuit cli, cannot fetch models from AI Gateway'
			);
			return {};
		}
	}

	if (!apiKey) {
		console.warn('Cannot determine the API key, cannot fetch models from AI Gateway');
		return {};
	}

	process.env.AGENTUITY_AIGATEWAY_KEY = apiKey;
	if (orgId) {
		process.env.AGENTUITY_AIGATEWAY_ORGID = orgId;
	}

	try {
		const service = new AIGatewayService(
			baseUrl,
			createServerFetchAdapter({ headers: {} }, createMinimalLogger())
		);
		return await service.listModels();
	} catch (error) {
		throw new AIGatewayModelFetchError({
			message: 'Failed to fetch models from AI Gateway',
			cause: error,
		});
	}
}

function sanitizeModalities(modalities: string[] | undefined): ('text' | 'image')[] {
	const sanitized = (modalities ?? []).filter(
		(modality): modality is 'text' | 'image' => modality === 'text' || modality === 'image'
	);
	return sanitized.length > 0 ? sanitized : ['text'];
}

function toPiModel(m: AIGatewayModel): ProviderModelConfig {
	return {
		id: m.id,
		name: m.name,
		reasoning: m.reasoning ?? false,
		input: sanitizeModalities(m.input_modalities),
		contextWindow: m.context_window ?? 40000,
		maxTokens: m.max_output_tokens ?? 64000,
		cost: {
			input: m.pricing?.input ?? 0,
			output: m.pricing?.output ?? 0,
			cacheRead: m.pricing?.cached_input ?? 0,
			cacheWrite: 0,
		},
		compat: {
			supportsDeveloperRole: false,
		},
	};
}

export async function setupAIGateway(pi: ExtensionAPI) {
	const models = await fetchModels();
	const baseUrl = getBaseUrl();

	const allModels: AIGatewayModel[] = [];
	for (const providerModels of Object.values(models)) {
		if (providerModels) {
			allModels.push(...providerModels);
		}
	}
	if (allModels.length === 0) {
		return;
	}

	const modelsByApi = new Map<KnownApi, ProviderModelConfig[]>();

	for (const m of allModels) {
		const apiType = m.api;
		if (!isKnownApi(apiType)) {
			continue; // THIS SHOULD NEVER HAPPEN BUT JUST IN CASE
		}
		const existing = modelsByApi.get(apiType) ?? [];
		existing.push(toPiModel(m));
		modelsByApi.set(apiType, existing);
	}

	const headers: Record<string, string> = {};
	if (process.env.AGENTUITY_AIGATEWAY_ORGID) {
		headers['x-agentuity-orgid'] = process.env.AGENTUITY_AIGATEWAY_ORGID;
	}

	for (const [apiType, providerModels] of modelsByApi) {
		const apitok = apiType.split('-');
		const name = apitok.length >= 2 ? apitok.slice(0, 2).join('-') : apitok[0];
		const providerName = `agentuity/${name}`;
		pi.registerProvider(providerName, {
			baseUrl,
			apiKey: 'AGENTUITY_AIGATEWAY_KEY',
			headers,
			authHeader: true,
			api: apiType,
			models: providerModels,
		});
	}
}
