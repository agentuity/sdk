/**
 * Hub URL resolution for Coder CLI commands.
 *
 * Resolution priority:
 *   1. --hub-url flag (explicit per-command override)
 *   2. AGENTUITY_CODER_HUB_URL env var
 *   3. Stored per-profile Hub URL
 *   4. AGENTUITY_DEVMODE_URL env var (dev tunnel URL)
 */

import {
	clearStoredCoderApiKey,
	getStoredCoderApiKey,
	getStoredCoderHubUrl,
} from '../../coder-config';
import { normalizeCoderHubHttpUrl, toCoderHubWsUrl } from '../../coder-hub-url';
import { getCommand } from '../../command-prefix';
import type { Config } from '../../types';
import { getVersion } from '../../version';

export type HubApiKeySource = 'env' | 'stored' | 'none';

export interface ResolvedHubApiKey {
	apiKey: string | null;
	source: HubApiKeySource;
}

/**
 * Resolve the Hub HTTP base URL for REST API calls.
 * Converts ws:// URLs to http:// automatically.
 *
 * @param flagUrl  Optional --hub-url flag value
 * @returns HTTP base URL (e.g. "http://localhost:3500") or null if Hub is unreachable
 */
export async function resolveHubUrl(
	flagUrl?: string,
	config?: Config | null
): Promise<string | null> {
	// 1. Explicit flag
	if (flagUrl) return normalizeCoderHubHttpUrl(flagUrl);

	// 2. Env var (explicit)
	const envUrl = process.env.AGENTUITY_CODER_HUB_URL;
	if (envUrl) return normalizeCoderHubHttpUrl(envUrl);

	// 3. Stored profile config
	const storedUrl = await getStoredCoderHubUrl(config);
	if (storedUrl) return storedUrl;

	// 4. Dev mode URL (tunnel)
	const devUrl = process.env.AGENTUITY_DEVMODE_URL;
	if (devUrl) return normalizeCoderHubHttpUrl(devUrl);

	return null;
}

/**
 * Resolve the Hub WebSocket URL for Pi extension connections.
 * Converts http:// URLs to ws:// automatically and ensures /api/ws path.
 *
 * @param flagUrl  Optional --hub-url flag value
 * @returns WebSocket URL (e.g. "ws://127.0.0.1:3500/api/ws") or null
 */
export async function resolveHubWsUrl(
	flagUrl?: string,
	config?: Config | null
): Promise<string | null> {
	const httpUrl = await resolveHubUrl(flagUrl, config);
	if (!httpUrl) return null;
	return toHubWsUrl(httpUrl);
}

export function toHubWsUrl(hubHttpUrl: string): string {
	return toCoderHubWsUrl(hubHttpUrl);
}

/**
 * Resolve the API key for Hub authentication.
 */
function resolveEnvApiKey(): string | null {
	return process.env.AGENTUITY_CODER_API_KEY || null;
}

export async function resolveHubApiKey(config?: Config | null): Promise<ResolvedHubApiKey> {
	const envApiKey = resolveEnvApiKey();
	if (envApiKey) {
		return {
			apiKey: envApiKey,
			source: 'env',
		};
	}

	const storedApiKey = await getStoredCoderApiKey(config);
	if (storedApiKey) {
		return {
			apiKey: storedApiKey,
			source: 'stored',
		};
	}

	return {
		apiKey: null,
		source: 'none',
	};
}

/**
 * Build headers object with API key if available.
 */
export function hubFetchHeaders(
	extra?: Record<string, string>,
	apiKey?: string | null
): Record<string, string> {
	const headers: Record<string, string> = { ...extra };
	headers['User-Agent'] = `Agentuity Coder/${getVersion()}`;
	const resolvedApiKey = apiKey === undefined ? resolveEnvApiKey() : apiKey;
	if (resolvedApiKey) headers['x-agentuity-auth-api-key'] = resolvedApiKey;
	return headers;
}

export function isHubUnauthorizedStatus(status: number): boolean {
	return status === 401 || status === 403;
}

export async function clearStoredHubApiKeyOnUnauthorized(
	status: number,
	resolvedApiKey: ResolvedHubApiKey,
	config?: Config | null,
	clearStoredApiKey: (config?: Config | null) => Promise<unknown> = clearStoredCoderApiKey
): Promise<boolean> {
	if (!isHubUnauthorizedStatus(status) || resolvedApiKey.source !== 'stored') {
		return false;
	}

	await clearStoredApiKey(config);
	return true;
}

export function getHubUrlSetupGuidance(): string {
	return (
		`Set a default Hub URL with:\n` +
		`  ${getCommand('coder config set url <url>')}\n\n` +
		`Or pass --hub-url for a one-off override, or use AGENTUITY_CODER_HUB_URL.`
	);
}

export function getHubApiKeySetupGuidance(): string {
	return (
		`Set a Hub API key with:\n` +
		`  ${getCommand('coder config set apikey <apikey>')}\n\n` +
		`Or use AGENTUITY_CODER_API_KEY as an override.`
	);
}

export function formatMissingHubUrlMessage(): string {
	return `Could not find a configured Coder Hub URL.\n\n${getHubUrlSetupGuidance()}`;
}

export function formatHubUnauthorizedMessage(
	hubUrl: string,
	serverMessage: string,
	options?: {
		clearedStoredKey?: boolean;
	}
): string {
	const clearedStoredKey = options?.clearedStoredKey ? 'Stored Hub API key cleared.\n\n' : '';

	return (
		`Coder Hub at ${hubUrl} requires a valid API key.\n\n` +
		`${clearedStoredKey}${getHubApiKeySetupGuidance()}\n\n` +
		`Server said: ${serverMessage}`
	);
}

export async function getHubResponseErrorMessage(response: Response): Promise<string> {
	const fallback = `${response.status} ${response.statusText}`;

	try {
		const payload = (await response.clone().json()) as {
			error?: unknown;
			message?: unknown;
			details?: unknown;
		};
		if (typeof payload.error === 'string' && payload.error.trim()) {
			return payload.error.trim();
		}
		if (typeof payload.message === 'string' && payload.message.trim()) {
			return payload.message.trim();
		}
		if (typeof payload.details === 'string' && payload.details.trim()) {
			return payload.details.trim();
		}
	} catch {
		// Fall back to the response text below.
	}

	try {
		const text = (await response.text()).trim();
		if (text) return text;
	} catch {
		// Fall back to the status text below.
	}

	return fallback;
}
