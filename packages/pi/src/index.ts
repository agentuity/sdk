/**
 * Agentuity AI Gateway Custom Provider Extension
 *
 * Registers models from the Agentuity AI Gateway using the appropriate API type
 * based on model ID patterns. Models are loaded dynamically from the gateway's /models endpoint.
 *
 * Usage:
 *   Use /model to switch to aigateway models
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createMinimalLogger, StructuredError } from '@agentuity/core';
import {
	AIGatewayService,
	type AIGatewayModel,
	type AIGatewayModels,
} from '@agentuity/core/aigateway';
import { createServerFetchAdapter } from '@agentuity/server';
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ProviderModelConfig,
} from '@earendil-works/pi-coding-agent';

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

type AgentuityOrganization = {
	id: string;
	name: string;
};

type AgentuityWhoami = {
	organizations?: AgentuityOrganization[];
};

type AgentuityRegion = {
	region: string;
	description: string;
	default?: boolean;
};

function parseFirstJsonObject(value: string): unknown {
	const start = value.indexOf('{');
	if (start === -1) {
		throw new SyntaxError('No JSON object found');
	}

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < value.length; i++) {
		const char = value[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth === 0) {
				return JSON.parse(value.slice(start, i + 1));
			}
		}
	}

	throw new SyntaxError('Unterminated JSON object');
}

function parseJson(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed.startsWith('[')) {
		return JSON.parse(trimmed);
	}
	return parseFirstJsonObject(trimmed);
}

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

function getAgentuityCliPath(): string | undefined {
	const path = process.env.PATH?.split(delimiter) ?? [];
	for (const dir of path) {
		const fn = join(dir, 'agentuity');
		if (existsSync(fn)) {
			return fn;
		}
	}
}

function fetchOrganizations(): AgentuityOrganization[] {
	const agentuity = getAgentuityCliPath();
	if (!agentuity) {
		return [];
	}

	const res = execFileSync(agentuity, ['auth', 'whoami', '--json']);
	const whoami = parseJson(res.toString()) as AgentuityWhoami;
	return (whoami.organizations ?? []).filter(
		(org): org is AgentuityOrganization =>
			typeof org?.id === 'string' &&
			org.id.length > 0 &&
			typeof org?.name === 'string' &&
			org.name.length > 0
	);
}

function fetchRegions(): AgentuityRegion[] {
	const agentuity = getAgentuityCliPath();
	if (!agentuity) {
		return [];
	}

	const res = execFileSync(agentuity, ['cloud', 'region', 'list', '--json']);
	const regions = parseJson(res.toString()) as AgentuityRegion[];
	return (Array.isArray(regions) ? regions : []).filter(
		(region): region is AgentuityRegion =>
			typeof region?.region === 'string' &&
			region.region.length > 0 &&
			typeof region?.description === 'string' &&
			region.description.length > 0
	);
}

function getCurrentOrgId(): string | undefined {
	return normalizeCredential(
		getEnv(
			'AGENTUITY_AIGATEWAY_ORGID',
			'AGENTUITY_ORGID',
			'AGENTUITY_CLOUD_ORG_ID',
			'AGENTUITY_ORG_ID'
		)
	);
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
		const fn = getAgentuityCliPath();
		if (fn) {
			try {
				const res = execFileSync(fn, ['auth', 'apikey', '--json']);
				const apiKeyResult = parseJson(res.toString()) as { apiKey: string };
				apiKey = normalizeCredential(apiKeyResult.apiKey);
				found = true;
				if (!orgId) {
					const ores = execFileSync(fn, ['auth', 'org', 'current']);
					orgId = normalizeCredential(ores);
					if (!orgId) {
						return {};
					}
				}
			} catch (error) {
				throw new AIGatewayModelFetchError({
					message: 'Failed to fetch models from AI Gateway',
					cause: error,
				});
			}
		}
		if (!found) {
			console.warn(
				'AGENTUITY_SDK_KEY, AGENTUITY_CLI_API_KEY or AGENTUITY_CLI_KEY not set and cannot find the agentuity cli, cannot fetch models from AI Gateway'
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

function supportsPiTextChat(m: AIGatewayModel): boolean {
	const inputModalities =
		m.input_modalities && m.input_modalities.length > 0 ? m.input_modalities : ['text'];
	const outputModalities =
		m.output_modalities && m.output_modalities.length > 0 ? m.output_modalities : ['text'];
	return inputModalities.includes('text') && outputModalities.includes('text');
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

async function registerAIGatewayProviders(pi: ExtensionAPI) {
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
			continue;
		}
		if (!supportsPiTextChat(m)) {
			continue;
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

function registerRegionCommand(pi: ExtensionAPI): void {
	pi.registerCommand('region', {
		description: 'Select active Agentuity region',
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) {
				return;
			}

			let regions: AgentuityRegion[];
			try {
				regions = fetchRegions();
			} catch (error) {
				ctx.ui.notify(`Failed to load Agentuity regions: ${String(error)}`, 'error');
				return;
			}

			if (regions.length === 0) {
				ctx.ui.notify('No Agentuity regions found.', 'warning');
				return;
			}

			const currentRegion = getRegion();
			const labels = regions.map((region) => {
				const marker = region.region === currentRegion ? '* ' : '';
				const defaultLabel = region.default ? ' default' : '';
				return `${marker}${region.description} (${region.region})${defaultLabel}`;
			});
			const selected = await ctx.ui.select('Select Agentuity Region', labels);
			if (!selected) {
				return;
			}

			const selectedIndex = labels.indexOf(selected);
			const region = regions[selectedIndex];
			if (!region) {
				return;
			}

			process.env.AGENTUITY_REGION = region.region;
			ctx.ui.notify(`Using Agentuity region: ${region.description}`, 'info');

			try {
				await registerAIGatewayProviders(pi);
				ctx.ui.notify('Agentuity AI Gateway models refreshed.', 'info');
			} catch (error) {
				ctx.ui.notify(`Failed to refresh AI Gateway models: ${String(error)}`, 'error');
			}
		},
	});
}

function registerOrganizationCommand(pi: ExtensionAPI): void {
	pi.registerCommand('organization', {
		description: 'Select active Agentuity organization',
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) {
				return;
			}

			let organizations: AgentuityOrganization[];
			try {
				organizations = fetchOrganizations();
			} catch (error) {
				ctx.ui.notify(`Failed to load Agentuity organizations: ${String(error)}`, 'error');
				return;
			}

			if (organizations.length === 0) {
				ctx.ui.notify('No Agentuity organizations found for the current CLI login.', 'warning');
				return;
			}

			const currentOrgId = getCurrentOrgId();
			const labels = organizations.map((org) => {
				const marker = org.id === currentOrgId ? '* ' : '';
				return `${marker}${org.name} (${org.id})`;
			});
			const selected = await ctx.ui.select('Select Agentuity Organization', labels);
			if (!selected) {
				return;
			}

			const selectedIndex = labels.indexOf(selected);
			const organization = organizations[selectedIndex];
			if (!organization) {
				return;
			}

			process.env.AGENTUITY_AIGATEWAY_ORGID = organization.id;
			process.env.AGENTUITY_ORGID = organization.id;
			process.env.AGENTUITY_CLOUD_ORG_ID = organization.id;
			process.env.AGENTUITY_ORG_ID = organization.id;

			ctx.ui.notify(`Using Agentuity organization: ${organization.name}`, 'info');

			try {
				await registerAIGatewayProviders(pi);
				ctx.ui.notify('Agentuity AI Gateway models refreshed.', 'info');
			} catch (error) {
				ctx.ui.notify(`Failed to refresh AI Gateway models: ${String(error)}`, 'error');
			}
		},
	});
}

export async function setupAIGateway(pi: ExtensionAPI) {
	registerOrganizationCommand(pi);
	registerRegionCommand(pi);
	let showedOrganizationPrompt = false;
	pi.on('session_start', (_event, ctx) => {
		if (showedOrganizationPrompt || !ctx.hasUI || getCurrentOrgId()) {
			return;
		}
		showedOrganizationPrompt = true;
		ctx.ui.notify(
			'Use /organization to select an Agentuity organization for AI Gateway models.',
			'info'
		);
	});
	await registerAIGatewayProviders(pi);
}

export default setupAIGateway;
