/**
 * Auth configuration for @agentuity/auth.
 *
 * Provides sensible defaults and wraps BetterAuth with Agentuity-specific helpers.
 *
 * @module agentuity/config
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, jwt, bearer, apiKey } from 'better-auth/plugins';
import { createPostgresDrizzle } from '@agentuity/drizzle';
import * as authSchema from '../schema.ts';

// Re-export plugin types for convenience
export type {
	Organization,
	OrganizationMember,
	OrganizationInvitation,
	OrganizationApiMethods,
	ApiKey,
	ApiKeyPluginOptions,
	ApiKeyApiMethods,
	JwtApiMethods,
	DefaultPluginApiMethods,
} from './plugins/index.ts';

export { DEFAULT_API_KEY_OPTIONS } from './plugins/index.ts';

import type { ApiKeyPluginOptions, DefaultPluginApiMethods } from './plugins/index.ts';
import { DEFAULT_API_KEY_OPTIONS } from './plugins/index.ts';

/**
 * Type for user-provided trustedOrigins input.
 * Allows undefined values in arrays to support environment variables directly.
 *
 * @example
 * ```typescript
 * trustedOrigins: [
 *   process.env.APP_URL, // string | undefined - OK!
 *   "https://example.com",
 * ]
 * ```
 */
type TrustedOriginsInput =
	| (string | undefined)[]
	| ((request?: Request) => (string | undefined)[] | Promise<(string | undefined)[]>);

/**
 * Type for BetterAuth trustedOrigins option (strict string[]).
 * Used internally after filtering out undefined values.
 */
type TrustedOrigins = string[] | ((request?: Request) => string[] | Promise<string[]>);

// =============================================================================
// Base Interface for Middleware
// =============================================================================

/**
 * Base interface for the auth instance used by middleware and route handlers.
 *
 * This interface defines the core authentication APIs that Agentuity middleware
 * relies on. It's designed to be stable and middleware-friendly while the full
 * auth instance provides additional type-safe APIs for your application code.
 *
 * @remarks
 * You typically don't interact with this interface directly. Instead, use
 * `createAuth()` to create an auth instance which implements this interface.
 *
 * @see {@link createAuth} - Create an auth instance
 * @see {@link createSessionMiddleware} - Session-based authentication middleware
 * @see {@link createApiKeyMiddleware} - API key authentication middleware
 */
export interface AuthBase {
	/**
	 * HTTP request handler for auth routes.
	 *
	 * Handles all auth-related endpoints like sign-in, sign-up, sign-out,
	 * password reset, OAuth callbacks, and session management.
	 *
	 * @param request - The incoming HTTP request
	 * @returns Response for the auth endpoint
	 */
	handler: (request: Request) => Promise<Response>;

	/**
	 * Server-side API methods for authentication operations.
	 *
	 * These methods are used internally by middleware and can also be called
	 * directly in your route handlers for custom authentication logic.
	 */
	api: {
		/**
		 * Get the current session from request headers.
		 *
		 * @param params - Object containing the request headers
		 * @returns The session with user info, or null if not authenticated
		 */
		getSession: (params: { headers: Headers }) => Promise<{
			user: { id: string; name?: string | null; email: string };
			session: { id: string; userId: string; activeOrganizationId?: string };
		} | null>;

		/**
		 * Get full organization details including members.
		 *
		 * @param params - Object containing the request headers
		 * @returns Full organization details, or null if no active org
		 */
		getFullOrganization: (params: {
			query?: {
				organizationId?: string;
				organizationSlug?: string;
				membersLimit?: number;
			};
			headers?: Headers;
		}) => Promise<{
			id: string;
			name?: string;
			slug?: string;
			members?: Array<{ userId: string; role: string; id?: string }>;
		} | null>;

		/**
		 * Verify an API key and get its metadata.
		 *
		 * @param params - Object containing the API key to verify
		 * @returns Validation result with key details if valid
		 */
		verifyApiKey: (params: { body: { key: string } }) => Promise<{
			valid: boolean;
			error?: { message: string; code: string } | null;
			key?: {
				id: string;
				name?: string;
				userId?: string;
				permissions?: Record<string, string[]> | null;
			} | null;
		}>;
	} & DefaultPluginApiMethods;
}

/**
 * Safely parse a URL and return its origin, or undefined if invalid.
 */
function safeOrigin(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
}

/**
 * Parse a domain or URL into an origin.
 * Handles both full URLs (https://example.com) and bare domains (example.com).
 * Bare domains default to https:// scheme.
 */
function parseOriginLike(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	// If it looks like a URL with scheme, parse as-is
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
		return safeOrigin(trimmed);
	}

	// Otherwise, treat as host[:port] and assume https
	return safeOrigin(`https://${trimmed}`);
}

/**
 * Resolve the base URL for the auth instance.
 *
 * Priority:
 * 1. Explicit `baseURL` option
 * 2. `AGENTUITY_CLOUD_BASE_URL` env var (Agentuity platform-injected for cloud deployments)
 * 3. `AGENTUITY_BASE_URL` env var (Agentuity platform-injected, legacy fallback)
 * 4. `BETTER_AUTH_URL` env var (BetterAuth standard, for 3rd party SDK compatibility)
 *
 * Empty or whitespace-only values are treated as missing and skipped.
 */
function resolveBaseURL(explicitBaseURL?: string): string | undefined {
	const candidates = [
		explicitBaseURL,
		process.env.AGENTUITY_CLOUD_BASE_URL,
		process.env.AGENTUITY_BASE_URL,
		process.env.BETTER_AUTH_URL,
	];

	for (const candidate of candidates) {
		const trimmed = candidate?.trim();
		if (trimmed) {
			return trimmed;
		}
	}

	return undefined;
}

/**
 * Resolve the auth secret.
 *
 * Priority:
 * 1. Explicit `secret` option
 * 2. `AGENTUITY_AUTH_SECRET` env var (Agentuity convention)
 * 3. `BETTER_AUTH_SECRET` env var (BetterAuth standard, for backward compatibility)
 */
function resolveSecret(explicitSecret?: string): string | undefined {
	return explicitSecret ?? process.env.AGENTUITY_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
}

/**
 * Create the default trustedOrigins function for Agentuity deployments.
 *
 * This provides zero-config CORS/origin handling:
 * - Trusts the resolved baseURL origin
 * - Trusts the AGENTUITY_BASE_URL origin
 * - Trusts all domains from AGENTUITY_CLOUD_DOMAINS (platform-set, comma-separated)
 * - Trusts additional domains from AUTH_TRUSTED_DOMAINS (developer-set, comma-separated)
 * - Trusts the same-origin of incoming requests (request.url.origin)
 *
 * @param baseURL - The resolved base URL for the auth instance
 */
function createDefaultTrustedOrigins(baseURL?: string): (request?: Request) => Promise<string[]> {
	const agentuityURL = process.env.AGENTUITY_BASE_URL;
	const cloudDomains = process.env.AGENTUITY_CLOUD_DOMAINS;
	const devTrustedDomains = process.env.AUTH_TRUSTED_DOMAINS;

	const staticOrigins = new Set<string>();

	const baseOrigin = safeOrigin(baseURL);
	if (baseOrigin) staticOrigins.add(baseOrigin);

	const agentuityOrigin = safeOrigin(agentuityURL);
	if (agentuityOrigin) staticOrigins.add(agentuityOrigin);

	// Platform-set cloud domains (deployment, project, PR, custom domains, tunnels)
	if (cloudDomains) {
		for (const raw of cloudDomains.split(',')) {
			const origin = parseOriginLike(raw);
			if (origin) staticOrigins.add(origin);
		}
	}

	// Developer-set additional trusted domains
	if (devTrustedDomains) {
		for (const raw of devTrustedDomains.split(',')) {
			const origin = parseOriginLike(raw);
			if (origin) staticOrigins.add(origin);
		}
	}

	return async (request?: Request): Promise<string[]> => {
		const origins = new Set(staticOrigins);

		if (request) {
			const requestOrigin = safeOrigin(request.url);
			if (requestOrigin) origins.add(requestOrigin);
		}

		return [...origins];
	};
}

/**
 * Configuration options for auth.
 * Extends BetterAuth options with Agentuity-specific settings.
 *
 * Note: `trustedOrigins` accepts arrays with undefined values to support
 * environment variables directly (e.g., `process.env.APP_URL`).
 * Undefined values are automatically filtered out.
 */
export interface AuthOptions extends Omit<BetterAuthOptions, 'trustedOrigins'> {
	/**
	 * List of trusted origins for CORS and callback validation.
	 * Can be a static array of origin strings, or a function that returns origins.
	 *
	 * Supports environment variables directly - undefined values are filtered out:
	 * ```typescript
	 * trustedOrigins: [
	 *   process.env.APP_URL, // string | undefined - works!
	 *   "https://example.com",
	 * ]
	 * ```
	 */
	trustedOrigins?: TrustedOriginsInput;

	/**
	 * PostgreSQL connection string.
	 * When provided, creates a resilient PostgreSQL pool and Drizzle instance
	 * internally using `createPostgresDrizzle()` with automatic reconnection.
	 * This is the simplest path — just provide the connection string.
	 *
	 * @example
	 * ```typescript
	 * const auth = createAuth({
	 *   connectionString: process.env.DATABASE_URL,
	 * });
	 * ```
	 */
	connectionString?: string;

	/**
	 * Skip default plugins (organization, jwt, bearer, apiKey).
	 * Use this if you want full control over plugins.
	 */
	skipDefaultPlugins?: boolean;

	/**
	 * API Key plugin configuration.
	 * Set to false to disable the API key plugin entirely.
	 */
	apiKey?: ApiKeyPluginOptions | false;
}

/**
 * Default plugins included with Agentuity auth.
 *
 * @param apiKeyOptions - API key plugin options, or false to disable
 */
export function getDefaultPlugins(apiKeyOptions?: ApiKeyPluginOptions | false) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const plugins: any[] = [
		organization(),
		jwt({
			jwt: {
				definePayload: ({ user, session }) => ({
					sub: user.id,
					email: user.email,
					name: user.name,
					emailVerified: user.emailVerified,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
					sessionId: session.id,
					activeOrganizationId: (session as Record<string, unknown>).activeOrganizationId,
					// Deliberately exclude user.image to keep JWT tokens small.
					// Profile images (especially base64-encoded data URIs from OAuth)
					// can significantly bloat the token. Consumers should fetch the
					// image separately via the user API if needed.
				}),
			},
		}),
		bearer(),
	];

	// Add API key plugin unless explicitly disabled
	if (apiKeyOptions !== false) {
		const opts = { ...DEFAULT_API_KEY_OPTIONS, ...apiKeyOptions };

		if (opts.enabled) {
			plugins.push(
				apiKey({
					apiKeyHeaders: opts.apiKeyHeaders,
					enableSessionForAPIKeys: opts.enableSessionForAPIKeys,
					defaultPrefix: opts.defaultPrefix,
					defaultKeyLength: opts.defaultKeyLength,
					enableMetadata: opts.enableMetadata,
				})
			);
		}
	}

	return plugins;
}

/**
 * Create an Auth instance.
 *
 * This wraps BetterAuth with sensible defaults for Agentuity projects:
 * - Default basePath: '/api/auth'
 * - Email/password authentication enabled by default
 * - Organization plugin for multi-tenancy
 * - JWT plugin for token-based auth
 * - Bearer plugin for API auth
 * - API Key plugin for programmatic access
 * - Experimental joins enabled by default for better performance
 *
 * @example Option A: Connection string (simplest)
 * ```typescript
 * import { createAuth } from '@agentuity/auth';
 *
 * export const auth = createAuth({
 *   connectionString: process.env.DATABASE_URL,
 * });
 * ```
 *
 * @example Option B: Bring your own Drizzle
 * ```typescript
 * import { drizzle } from 'drizzle-orm/bun-sql';
 * import { drizzleAdapter } from 'better-auth/adapters/drizzle';
 * import * as authSchema from '@agentuity/auth/schema';
 *
 * const schema = { ...authSchema, ...myAppSchema };
 * const db = drizzle(connectionString, { schema });
 *
 * export const auth = createAuth({
 *   database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
 * });
 * ```
 *
 * @example Option C: Other adapters (Prisma, MongoDB, etc.)
 * ```typescript
 * import { prismaAdapter } from 'better-auth/adapters/prisma';
 *
 * export const auth = createAuth({
 *   database: prismaAdapter(new PrismaClient()),
 * });
 * ```
 */
export function createAuth<T extends AuthOptions>(options: T) {
	const {
		skipDefaultPlugins,
		plugins = [],
		apiKey: apiKeyOptions,
		connectionString,
		...restOptions
	} = options;

	const resolvedBaseURL = resolveBaseURL(restOptions.baseURL);
	const resolvedSecret = resolveSecret(restOptions.secret);

	// Apply Agentuity defaults
	const basePath = restOptions.basePath ?? '/api/auth';
	const emailAndPassword = restOptions.emailAndPassword ?? { enabled: true };

	// Handle trustedOrigins - filter out undefined values from user input
	let trustedOrigins: TrustedOrigins;
	if (restOptions.trustedOrigins) {
		const userOrigins = restOptions.trustedOrigins;
		if (typeof userOrigins === 'function') {
			// Wrap the function to filter undefined values from its result
			trustedOrigins = async (request?: Request): Promise<string[]> => {
				const result = await userOrigins(request);
				return result.filter(
					(origin: string | undefined): origin is string => origin !== undefined
				);
			};
		} else {
			// Filter undefined values from static array
			trustedOrigins = userOrigins.filter(
				(origin: string | undefined): origin is string => origin !== undefined
			);
		}
	} else {
		trustedOrigins = createDefaultTrustedOrigins(resolvedBaseURL);
	}

	const defaultPlugins = skipDefaultPlugins ? [] : getDefaultPlugins(apiKeyOptions);

	// Handle database configuration
	let database = restOptions.database;

	// ConnectionString provided — use createPostgresDrizzle (defaults to pg driver
	// with resilient PostgresPool for automatic reconnection).
	// See: https://github.com/agentuity/sdk/issues/1030
	if (connectionString && !database) {
		const { db } = createPostgresDrizzle({
			connectionString,
			schema: authSchema,
		});
		database = drizzleAdapter(db, {
			provider: 'pg',
			schema: authSchema,
		});
	}

	// Default experimental.joins to true for better performance
	const experimental = {
		joins: true,
		...restOptions.experimental,
	};

	const authInstance = betterAuth({
		...restOptions,
		database,
		basePath,
		emailAndPassword,
		experimental,
		...(resolvedBaseURL ? { baseURL: resolvedBaseURL } : {}),
		...(resolvedSecret ? { secret: resolvedSecret } : {}),
		trustedOrigins,
		plugins: [...defaultPlugins, ...plugins],
	});

	return authInstance as AuthBase &
		typeof authInstance & {
			api: typeof authInstance.api & DefaultPluginApiMethods;
		};
}

/**
 * Type helper for the auth instance with default plugin methods.
 * Inferred from createAuth to stay in sync with BetterAuth.
 */
export type AuthInstance = ReturnType<typeof createAuth>;
