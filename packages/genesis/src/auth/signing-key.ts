import type { UpstreamIdentitySigningKey } from './types.ts';

export const DEFAULT_AUTH_HUB_URL = 'https://auth.agentcompany.com';
export const IDENTITY_SIGNING_KEY_PATH = '/.well-known/sso/identity-signing-key';

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

export async function fetchIdentitySigningKey(
	authHubUrl: string
): Promise<UpstreamIdentitySigningKey> {
	const url = identitySigningKeyUrl(authHubUrl);
	const response = await fetch(url, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});
	if (!response.ok) {
		throw new Error(
			`failed to fetch identity signing key: ${response.status} ${response.statusText}`
		);
	}
	const body = (await response.json()) as UpstreamIdentitySigningKey;
	if (!body.public_key_pem || !body.issuer || !body.token_scope) {
		throw new Error('identity signing key response missing required fields');
	}
	return body;
}
