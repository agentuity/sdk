/**
 * Clerk server-side authentication middleware for Hono.
 *
 * @module clerk/server
 */

import type { MiddlewareHandler } from 'hono';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { User } from '@clerk/backend';
import type { AgentuityAuth, AgentuityAuthUser } from '../types';

/**
 * Clerk JWT payload structure.
 */
export interface ClerkJWTPayload {
	/** Subject (user ID) */
	sub: string;
	/** Additional claims */
	[key: string]: unknown;
}

/**
 * Options for Clerk middleware.
 */
export interface ClerkMiddlewareOptions {
	/** Clerk secret key (defaults to process.env.CLERK_SECRET_KEY) */
	secretKey?: string;

	/** Custom token extractor function */
	getToken?: (authHeader: string) => string;

	/** Clerk publishable key for token verification */
	publishableKey?: string;
}

/**
 * Create Hono middleware for Clerk authentication.
 *
 * This middleware:
 * - Extracts and validates JWT tokens from Authorization header
 * - Returns 401 if token is missing or invalid
 * - Exposes authenticated user via c.var.auth
 *
 * @example
 * ```typescript
 * import { createMiddleware } from '@agentuity/auth/clerk';
 *
 * router.get('/api/profile', createMiddleware(), async (c) => {
 *   const user = await c.var.auth.getUser();
 *   return c.json({ email: user.email });
 * });
 * ```
 */
export function createMiddleware(options: ClerkMiddlewareOptions = {}): MiddlewareHandler {
	const secretKey = options.secretKey || process.env.CLERK_SECRET_KEY;
	const publishableKey =
		options.publishableKey ||
		process.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY ||
		process.env.CLERK_PUBLISHABLE_KEY;

	if (!secretKey) {
		console.error(
			'[Clerk Auth] CLERK_SECRET_KEY is not set. Add it to your .env file or pass secretKey option to createMiddleware()'
		);
		throw new Error(
			'Clerk secret key is required (set CLERK_SECRET_KEY or pass secretKey option)'
		);
	}

	if (!publishableKey) {
		console.warn(
			'[Clerk Auth] AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Token validation may fail. Add it to your .env file.'
		);
	}

	// Create Clerk client instance
	const clerkClient = createClerkClient({ secretKey });

	return async (c, next) => {
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

			// Verify token with Clerk (delegates validation to provider)
			const payload = (await verifyToken(token, {
				secretKey,
			})) as ClerkJWTPayload;

			// Validate payload has required subject claim
			if (!payload.sub || typeof payload.sub !== 'string') {
				throw new Error('Invalid token: missing or invalid subject claim');
			}

			// Memoize user fetch to avoid multiple API calls
			let cachedUser: AgentuityAuthUser<User> | null = null;

			// Create auth object with Clerk user and payload types
			const auth: AgentuityAuth<User, ClerkJWTPayload> = {
				async getUser() {
					if (cachedUser) {
						return cachedUser;
					}
					const user = await clerkClient.users.getUser(payload.sub);
					cachedUser = mapClerkUserToAgentuityUser(user);
					return cachedUser;
				},

				async getToken() {
					return token;
				},

				raw: payload,
			};

			// @ts-ignore - Module augmentation conflict when both Clerk and Auth0 are imported
			// This is expected - users should only use one provider at a time
			c.set('auth', auth);
			await next();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorCode =
				error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
					? error.code
					: 'CLERK_AUTH_ERROR';
			console.error(`[Clerk Auth] Authentication failed: ${errorCode} - ${errorMessage}`);
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

/**
 * Map Clerk User to AgentuityAuthUser.
 */
function mapClerkUserToAgentuityUser(clerkUser: User): AgentuityAuthUser<User> {
	return {
		id: clerkUser.id,
		name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || undefined,
		email: clerkUser.emailAddresses[0]?.emailAddress,
		raw: clerkUser,
	};
}

/**
 * Augment Hono's context types to include auth.
 *
 * Note: This conflicts with Auth0's module augmentation when both are imported.
 * Users should only use one provider at a time.
 */
declare module 'hono' {
	interface ContextVariableMap {
		// @ts-ignore - Conflicts with Auth0's auth type, but only one provider should be used
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}
