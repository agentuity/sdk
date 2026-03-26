/**
 * Hub URL resolution for Coder CLI commands.
 *
 * Resolution priority:
 *   1. --hub-url flag (explicit per-command override)
 *   2. AGENTUITY_CODER_HUB_URL env var
 *   3. AGENTUITY_DEVMODE_URL env var (dev tunnel URL)
 */

import { getVersion } from '../../version';

/**
 * Resolve the Hub HTTP base URL for REST API calls.
 * Converts ws:// URLs to http:// automatically.
 *
 * @param flagUrl  Optional --hub-url flag value
 * @returns HTTP base URL (e.g. "http://localhost:3500") or null if Hub is unreachable
 */
export async function resolveHubUrl(flagUrl?: string): Promise<string | null> {
	// 1. Explicit flag
	if (flagUrl) return normalizeToHttp(flagUrl);

	// 2. Env var (explicit)
	const envUrl = process.env.AGENTUITY_CODER_HUB_URL;
	if (envUrl) return normalizeToHttp(envUrl);

	// 3. Dev mode URL (tunnel)
	const devUrl = process.env.AGENTUITY_DEVMODE_URL;
	if (devUrl) return normalizeToHttp(devUrl);

	return null;
}

/**
 * Resolve the Hub WebSocket URL for Pi extension connections.
 * Converts http:// URLs to ws:// automatically and ensures /api/ws path.
 *
 * @param flagUrl  Optional --hub-url flag value
 * @returns WebSocket URL (e.g. "ws://127.0.0.1:3500/api/ws") or null
 */
export async function resolveHubWsUrl(flagUrl?: string): Promise<string | null> {
	const httpUrl = await resolveHubUrl(flagUrl);
	if (!httpUrl) return null;
	return toHubWsUrl(httpUrl);
}

export function toHubWsUrl(hubHttpUrl: string): string {
	return normalizeToWs(hubHttpUrl);
}

/**
 * Convert any URL form to an HTTP base URL (strip paths, convert ws->http).
 */
function normalizeToHttp(url: string): string {
	let normalized = url.trim().replace(/\/+$/, '');

	// ws:// -> http://
	if (normalized.startsWith('ws://')) normalized = 'http://' + normalized.slice(5);
	else if (normalized.startsWith('wss://')) normalized = 'https://' + normalized.slice(6);

	// Strip known Hub transport/helper paths to get the HTTP base URL.
	// Accept `/ws` as a convenience alias because users often copy the raw route name.
	normalized = normalized.replace(/\/api\/ws\b.*$/, '');
	normalized = normalized.replace(/\/ws\b.*$/, '');
	normalized = normalized.replace(/\/api\/hub\b.*$/, '');

	return normalized.replace(/\/+$/, '');
}

/**
 * Convert an HTTP base URL to a WebSocket URL with /api/ws path.
 */
function normalizeToWs(httpUrl: string): string {
	let wsUrl = httpUrl;
	if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
	else if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);

	try {
		const parsed = new URL(wsUrl);
		if (parsed.pathname !== '/api/ws') {
			parsed.pathname = '/api/ws';
			wsUrl = parsed.toString().replace(/\/$/, '');
		}
	} catch {
		if (!wsUrl.endsWith('/api/ws')) {
			wsUrl = wsUrl.replace(/\/?$/, '/api/ws');
		}
	}

	return wsUrl;
}

/**
 * Resolve the API key for Hub authentication.
 * TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
 */
export function resolveApiKey(): string | null {
	return process.env.AGENTUITY_CODER_API_KEY || null;
}

/**
 * Build headers object with API key if available.
 * TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
 */
export function hubFetchHeaders(extra?: Record<string, string>): Record<string, string> {
	const headers: Record<string, string> = { ...extra };
	headers['User-Agent'] = `Agentuity Coder/${getVersion()}`;
	const apiKey = resolveApiKey();
	if (apiKey) headers['x-agentuity-auth-api-key'] = apiKey;
	return headers;
}
