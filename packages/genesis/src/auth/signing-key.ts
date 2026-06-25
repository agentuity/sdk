import type { UpstreamIdentitySigningKey } from './types.ts';

export const DEFAULT_AUTH_HUB_URL = 'https://auth.agentcompany.com';
export const IDENTITY_SIGNING_KEY_PATH = '/.well-known/sso/identity-signing-key';
export const SIGNING_KEY_FETCH_TIMEOUT_MS = 10_000;

const REQUIRED_SIGNING_KEY_FIELDS: (keyof UpstreamIdentitySigningKey)[] = [
	'issuer',
	'algorithm',
	'key_id',
	'public_key_pem',
	'token_header',
	'token_scope',
	'token_audience_hint',
];

export function resolveAuthHubUrl(configured?: string): string {
	const raw =
		configured?.trim() ||
		(typeof process !== 'undefined' ? process.env.AGENTUITY_AUTH_HUB_URL?.trim() : undefined) ||
		DEFAULT_AUTH_HUB_URL;
	return raw.replace(/\/+$/, '');
}

export function identitySigningKeyUrl(authHubUrl: string): string {
	return `${resolveAuthHubUrl(authHubUrl)}${IDENTITY_SIGNING_KEY_PATH}`;
}

function signingKeyFetchSignal(): AbortSignal {
	if (typeof AbortSignal.timeout === 'function') {
		return AbortSignal.timeout(SIGNING_KEY_FETCH_TIMEOUT_MS);
	}
	const controller = new AbortController();
	setTimeout(() => controller.abort(), SIGNING_KEY_FETCH_TIMEOUT_MS);
	return controller.signal;
}

function validateSigningKeyBody(body: UpstreamIdentitySigningKey): UpstreamIdentitySigningKey {
	for (const field of REQUIRED_SIGNING_KEY_FIELDS) {
		const value = body[field];
		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`identity signing key response missing required field: ${field}`);
		}
	}
	return body;
}

export async function fetchIdentitySigningKey(
	authHubUrl: string
): Promise<UpstreamIdentitySigningKey> {
	const url = identitySigningKeyUrl(authHubUrl);
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal: signingKeyFetchSignal(),
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'TimeoutError') {
			throw new Error(
				`timed out fetching identity signing key after ${SIGNING_KEY_FETCH_TIMEOUT_MS}ms`
			);
		}
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(
				`timed out fetching identity signing key after ${SIGNING_KEY_FETCH_TIMEOUT_MS}ms`
			);
		}
		throw err;
	}
	if (!response.ok) {
		throw new Error(
			`failed to fetch identity signing key: ${response.status} ${response.statusText}`
		);
	}
	const body = (await response.json()) as UpstreamIdentitySigningKey;
	return validateSigningKeyBody(body);
}
