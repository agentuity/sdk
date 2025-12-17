/**
 * Auth0 server-side authentication middleware for Hono.
 *
 * @module auth0/server
 */

import { createMiddleware as createHonoMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { AgentuityAuth, AgentuityAuthUser } from '../types';

/**
 * Environment type for Auth0 middleware - provides typed context variables.
 */
export type Auth0Env = {
	Variables: {
		auth: AgentuityAuth<Auth0User, Auth0JWTPayload>;
	};
};

/**
 * Auth0 JWT payload structure.
 */
export interface Auth0JWTPayload {
	/** Subject (user ID) */
	sub: string;
	/** Email address */
	email?: string;
	/** Email verification status */
	email_verified?: boolean;
	/** Full name */
	name?: string;
	/** Given name */
	given_name?: string;
	/** Family name */
	family_name?: string;
	/** Picture URL */
	picture?: string;
	/** Additional claims */
	[key: string]: unknown;
}

/**
 * Auth0 user info from Management API.
 */
export interface Auth0User {
	/** User ID */
	user_id: string;
	/** Email address */
	email?: string;
	/** Email verification status */
	email_verified?: boolean;
	/** Full name */
	name?: string;
	/** Given name */
	given_name?: string;
	/** Family name */
	family_name?: string;
	/** Picture URL */
	picture?: string;
	/** Additional user metadata */
	[key: string]: unknown;
}

/**
 * Options for Auth0 middleware.
 */
export interface Auth0MiddlewareOptions {
	/** Auth0 domain (defaults to process.env.AUTH0_DOMAIN) */
	domain?: string;

	/** Auth0 audience/API identifier (defaults to process.env.AUTH0_AUDIENCE) */
	audience?: string;

	/** Auth0 issuer (defaults to https://{domain}/) */
	issuer?: string;

	/** Custom token extractor function */
	getToken?: (authHeader: string) => string;

	/** Whether to fetch full user profile from Management API (requires AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET) */
	fetchUserProfile?: boolean;
}

/**
 * Create Hono middleware for Auth0 authentication.
 *
 * This middleware:
 * - Extracts and validates JWT tokens from Authorization header
 * - Returns 401 if token is missing or invalid
 * - Exposes authenticated user via c.var.auth
 *
 * @example
 * ```typescript
 * import { createMiddleware } from '@agentuity/auth/auth0';
 *
 * router.get('/api/profile', createMiddleware(), async (c) => {
 *   const user = await c.var.auth.getUser();
 *   return c.json({ email: user.email });
 * });
 * ```
 */
export function createMiddleware(options: Auth0MiddlewareOptions = {}) {
	const domain =
		options.domain || process.env.AGENTUITY_PUBLIC_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN;
	const audience =
		options.audience || process.env.AGENTUITY_PUBLIC_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE;
	const issuer = options.issuer || (domain ? `https://${domain}/` : undefined);

	if (!domain) {
		console.error(
			'[Auth0 Auth] AUTH0_DOMAIN is not set. Add it to your .env file or pass domain option to createMiddleware()'
		);
		throw new Error('Auth0 domain is required (set AUTH0_DOMAIN or pass domain option)');
	}

	if (!issuer) {
		throw new Error('Auth0 issuer is required');
	}

	// Create JWKS client for fetching signing keys
	const client = jwksClient({
		jwksUri: `https://${domain}/.well-known/jwks.json`,
		cache: true,
		cacheMaxAge: 86400000, // 24 hours
	});

	// Get signing key function for jwt.verify
	const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
		if (!header.kid) {
			callback(new Error('No kid in token header'));
			return;
		}
		client.getSigningKey(header.kid, (err: Error | null, key?: jwksClient.SigningKey) => {
			if (err) {
				callback(err);
				return;
			}
			if (!key) {
				callback(new Error('No signing key found'));
				return;
			}
			const signingKey = key.getPublicKey();
			callback(null, signingKey);
		});
	};

	return createHonoMiddleware<Auth0Env>(async (c, next) => {
		const authHeader = c.req.header('Authorization');

		if (!authHeader) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		try {
			// Extract token from Bearer header
			let token: string;
			if (options.getToken) {
				token = options.getToken(authHeader);
			} else {
				// Validate Authorization scheme is Bearer
				if (!authHeader.match(/^Bearer\s+/i)) {
					return c.json({ error: 'Unauthorized' }, 401);
				}
				token = authHeader.replace(/^Bearer\s+/i, '');
			}

			// Ensure token is not empty
			if (!token || token.trim().length === 0) {
				return c.json({ error: 'Unauthorized' }, 401);
			}

			// Verify token with Auth0
			const verifyOptions: jwt.VerifyOptions = {
				issuer,
				algorithms: ['RS256'],
			};

			// Only validate audience if it's configured
			if (audience) {
				verifyOptions.audience = audience;
			}

			const payload = await new Promise<Auth0JWTPayload>((resolve, reject) => {
				jwt.verify(
					token,
					getKey,
					verifyOptions,
					(err: jwt.VerifyErrors | null, decoded: string | jwt.JwtPayload | undefined) => {
						if (err) {
							reject(err);
							return;
						}
						if (!decoded || typeof decoded !== 'object') {
							reject(new Error('Invalid token payload'));
							return;
						}
						resolve(decoded as Auth0JWTPayload);
					}
				);
			});

			// Validate payload has required subject claim
			if (!payload.sub || typeof payload.sub !== 'string') {
				throw new Error('Invalid token: missing or invalid subject claim');
			}

			// Memoize user fetch to avoid multiple API calls
			let cachedUser: AgentuityAuthUser<Auth0User> | null = null;

			// Create auth object with Auth0 payload types
			const auth: AgentuityAuth<Auth0User, Auth0JWTPayload> = {
				async getUser() {
					if (cachedUser) {
						return cachedUser;
					}

					// If fetchUserProfile is enabled, fetch from Management API (more complete data)
					if (options.fetchUserProfile) {
						const user = await fetchUserFromManagementAPI(payload.sub);
						cachedUser = mapAuth0UserToAgentuityUser(user);
					} else {
						// Fetch from /userinfo endpoint (access token has openid scope)
						const user = await fetchUserFromUserInfo(domain!, token);
						cachedUser = mapAuth0UserToAgentuityUser(user);
					}

					return cachedUser;
				},

				async getToken() {
					return token;
				},

				raw: payload,
			};

			c.set('auth', auth);
			await next();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorCode =
				error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
					? error.code
					: 'AUTH0_AUTH_ERROR';
			console.error(`[Auth0 Auth] Authentication failed: ${errorCode} - ${errorMessage}`);
			return c.json({ error: 'Unauthorized' }, 401);
		}
	});
}

/**
 * Fetch user info from Auth0 /userinfo endpoint using access token.
 */
async function fetchUserFromUserInfo(domain: string, accessToken: string): Promise<Auth0User> {
	const response = await fetch(`https://${domain}/userinfo`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch user info: ${response.status}`);
	}

	const userInfo = (await response.json()) as {
		sub: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		given_name?: string;
		family_name?: string;
		picture?: string;
		[key: string]: unknown;
	};

	return {
		user_id: userInfo.sub,
		email: userInfo.email,
		email_verified: userInfo.email_verified,
		name: userInfo.name,
		given_name: userInfo.given_name,
		family_name: userInfo.family_name,
		picture: userInfo.picture,
	};
}

/**
 * Map Auth0 User to AgentuityAuthUser.
 */
function mapAuth0UserToAgentuityUser(user: Auth0User): AgentuityAuthUser<Auth0User> {
	return {
		id: user.user_id,
		name:
			user.name ||
			(user.given_name && user.family_name
				? `${user.given_name} ${user.family_name}`.trim()
				: user.given_name || user.family_name),
		email: user.email,
		raw: user,
	};
}

// M2M token cache to avoid fetching on every request
let cachedM2MToken: { token: string; expiresAt: number } | null = null;

/**
 * Get M2M access token for Management API, with caching.
 */
async function getM2MAccessToken(
	domain: string,
	clientId: string,
	clientSecret: string
): Promise<string> {
	// Return cached token if still valid (with 60s buffer before expiry)
	if (cachedM2MToken && Date.now() < cachedM2MToken.expiresAt - 60000) {
		return cachedM2MToken.token;
	}

	const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			audience: `https://${domain}/api/v2/`,
			grant_type: 'client_credentials',
		}),
	});

	if (!tokenResponse.ok) {
		throw new Error('Failed to get Management API access token');
	}

	const { access_token, expires_in } = (await tokenResponse.json()) as {
		access_token: string;
		expires_in: number;
	};

	cachedM2MToken = {
		token: access_token,
		expiresAt: Date.now() + expires_in * 1000,
	};

	return access_token;
}

/**
 * Fetch user profile from Auth0 Management API.
 */
async function fetchUserFromManagementAPI(userId: string): Promise<Auth0User> {
	const clientId = process.env.AUTH0_M2M_CLIENT_ID;
	const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
	const domain = process.env.AGENTUITY_PUBLIC_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN;

	if (!clientId || !clientSecret || !domain) {
		throw new Error(
			'AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET, and AUTH0_DOMAIN must be set to fetch user profile'
		);
	}

	// Get cached or fresh Management API access token
	const accessToken = await getM2MAccessToken(domain, clientId, clientSecret);

	// Fetch user from Management API
	const userResponse = await fetch(
		`https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!userResponse.ok) {
		throw new Error('Failed to fetch user from Management API');
	}

	return (await userResponse.json()) as Auth0User;
}
