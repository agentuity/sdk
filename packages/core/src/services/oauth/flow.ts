import { getEnv } from '../env.ts';
import { OAuthResponseError } from './util.ts';
import { OAuthTokenResponseSchema, OAuthUserInfoSchema } from './types.ts';
import type { OAuthFlowConfig, OAuthTokenResponse, OAuthUserInfo } from './types.ts';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolve OAuth configuration by merging explicit config with environment variables.
 * Priority: explicit config > env vars > issuer-derived URLs > defaults.
 */
function resolveConfig(config?: OAuthFlowConfig) {
	const clientId = config?.clientId ?? getEnv('OAUTH_CLIENT_ID');
	const clientSecret = config?.clientSecret ?? getEnv('OAUTH_CLIENT_SECRET');
	const issuer = config?.issuer ?? getEnv('OAUTH_ISSUER');
	const authorizeUrl =
		config?.authorizeUrl ??
		getEnv('OAUTH_AUTHORIZE_URL') ??
		(issuer ? `${issuer}/authorize` : undefined);
	const tokenUrl =
		config?.tokenUrl ??
		getEnv('OAUTH_TOKEN_URL') ??
		(issuer ? `${issuer}/oauth/token` : undefined);
	const userinfoUrl =
		config?.userinfoUrl ??
		getEnv('OAUTH_USERINFO_URL') ??
		(issuer ? `${issuer}/userinfo` : undefined);
	const scopes = config?.scopes ?? getEnv('OAUTH_SCOPES') ?? 'openid profile email';

	const prompt = config?.prompt;

	return { clientId, clientSecret, issuer, authorizeUrl, tokenUrl, userinfoUrl, scopes, prompt };
}

/**
 * Build an OAuth 2.0 authorization URL for redirecting the user to the OIDC provider.
 *
 * @param redirectUri - The callback URL the provider will redirect to after authentication
 * @param config - Optional OAuth configuration. Falls back to environment variables.
 * @returns The full authorization URL to redirect the user to
 *
 * @example
 * ```typescript
 * // Uses OAUTH_CLIENT_ID, OAUTH_AUTHORIZE_URL (or OAUTH_ISSUER) from env
 * const url = buildAuthorizeUrl('http://localhost:3500/api/oauth/login');
 *
 * // Or with explicit config
 * const url = buildAuthorizeUrl('http://localhost:3500/api/oauth/login', {
 *   issuer: 'https://auth.agentuity.cloud',
 *   clientId: 'my-client-id',
 * });
 * ```
 */
export function buildAuthorizeUrl(redirectUri: string, config?: OAuthFlowConfig): string {
	const resolved = resolveConfig(config);

	if (!resolved.authorizeUrl) {
		throw new OAuthResponseError({
			message:
				'No authorize URL configured. Set OAUTH_AUTHORIZE_URL or OAUTH_ISSUER environment variable.',
		});
	}
	if (!resolved.clientId) {
		throw new OAuthResponseError({
			message: 'No client ID configured. Set OAUTH_CLIENT_ID environment variable.',
		});
	}

	const params = new URLSearchParams({
		client_id: resolved.clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: resolved.scopes,
	});

	if (resolved.prompt) {
		params.set('prompt', resolved.prompt);
	}

	return `${resolved.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 *
 * @param code - The authorization code received from the OAuth callback
 * @param redirectUri - The same redirect URI used in the authorization request
 * @param config - Optional OAuth configuration. Falls back to environment variables.
 * @returns The token response including access_token, and optionally refresh_token, id_token, etc.
 *
 * @example
 * ```typescript
 * const token = await exchangeToken(code, 'http://localhost:3500/api/oauth/login');
 * console.log(token.access_token);
 * ```
 */
export async function exchangeToken(
	code: string,
	redirectUri: string,
	config?: OAuthFlowConfig
): Promise<OAuthTokenResponse> {
	const resolved = resolveConfig(config);

	if (!resolved.tokenUrl) {
		throw new OAuthResponseError({
			message:
				'No token URL configured. Set OAUTH_TOKEN_URL or OAUTH_ISSUER environment variable.',
		});
	}
	if (!resolved.clientId) {
		throw new OAuthResponseError({
			message: 'No client ID configured. Set OAUTH_CLIENT_ID environment variable.',
		});
	}
	if (!resolved.clientSecret) {
		throw new OAuthResponseError({
			message: 'No client secret configured. Set OAUTH_CLIENT_SECRET environment variable.',
		});
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(resolved.tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				client_id: resolved.clientId,
				client_secret: resolved.clientSecret,
			}),
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new OAuthResponseError({
				message: `Token exchange timed out after ${DEFAULT_TIMEOUT_MS}ms`,
			});
		}
		throw err;
	}
	clearTimeout(timer);

	if (!response.ok) {
		const error = await response.text();
		throw new OAuthResponseError({
			message: `Token exchange failed (${response.status}): ${error}`,
		});
	}

	const data = await response.json();
	return OAuthTokenResponseSchema.parse(data);
}

/**
 * Fetch user information from the OIDC userinfo endpoint using an access token.
 *
 * @param accessToken - The access token obtained from the token exchange
 * @param config - Optional OAuth configuration. Falls back to environment variables.
 * @returns The user info including sub, name, email, and any additional claims
 *
 * @example
 * ```typescript
 * const user = await fetchUserInfo(token.access_token);
 * console.log(user.name, user.email);
 * ```
 */
export async function fetchUserInfo(
	accessToken: string,
	config?: OAuthFlowConfig
): Promise<OAuthUserInfo> {
	const resolved = resolveConfig(config);

	if (!resolved.userinfoUrl) {
		throw new OAuthResponseError({
			message:
				'No userinfo URL configured. Set OAUTH_USERINFO_URL or OAUTH_ISSUER environment variable.',
		});
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(resolved.userinfoUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new OAuthResponseError({
				message: `Userinfo request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
			});
		}
		throw err;
	}
	clearTimeout(timer);

	if (!response.ok) {
		const error = await response.text();
		throw new OAuthResponseError({
			message: `Failed to fetch user info (${response.status}): ${error}`,
		});
	}

	const data = await response.json();
	return OAuthUserInfoSchema.parse(data);
}
