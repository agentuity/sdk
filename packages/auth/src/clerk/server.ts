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
 *   const user = await c.var.auth.requireUser();
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
			const token = options.getToken
				? options.getToken(authHeader)
				: authHeader.replace(/^Bearer\s+/i, '');

			// Verify token with Clerk (delegates validation to provider)
			const payload = (await verifyToken(token, {
				secretKey,
				...(publishableKey && { publishableKey }),
			})) as ClerkJWTPayload;

			// Create auth object with Clerk user and payload types
			const auth: AgentuityAuth<User, ClerkJWTPayload> = {
				async requireUser() {
					const user = await clerkClient.users.getUser(payload.sub);
					return mapClerkUserToAgentuityUser(user);
				},

				async getToken() {
					return token;
				},

				raw: payload,
			};

			c.set('auth', auth);
			await next();
		} catch (error) {
			console.error('Clerk auth error:', error);
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
 */
declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}
