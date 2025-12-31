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
import { drizzle } from 'drizzle-orm/bun-sql';
import * as authSchema from '../schema';

/**
 * Type for BetterAuth trustedOrigins option.
 * Matches the signature expected by BetterAuthOptions.trustedOrigins.
 */
type TrustedOrigins = string[] | ((request?: Request) => string[] | Promise<string[]>);

// =============================================================================
// Base Interface for Middleware
// =============================================================================

/**
 * Minimal auth interface required by middleware and route mounting.
 *
 * This is a stable, non-generic interface that middleware functions accept.
 * It decouples middleware from the full BetterAuth generic types, avoiding
 * type inference issues while preserving rich types for end users.
 */
export interface AuthBase {
	/** Handler for auth routes (sign-in, sign-up, session, etc.) */
	handler: (request: Request) => Promise<Response>;

	/** API methods used by middleware */
	api: {
		/** Get session from request headers */
		getSession: (params: { headers: Headers }) => Promise<{
			user: { id: string; name?: string | null; email: string };
			session: { id: string; userId: string; activeOrganizationId?: string };
		} | null>;

		/** Get full organization details */
		getFullOrganization: (params: { headers: Headers }) => Promise<{
			id: string;
			name?: string;
			slug?: string;
			members?: Array<{ userId: string; role: string; id?: string }>;
		} | null>;

		/** Verify an API key */
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
 * Resolve the base URL for the auth instance.
 *
 * Priority:
 * 1. Explicit `baseURL` option
 * 2. `AGENTUITY_DEPLOYMENT_URL` env var (Agentuity platform-injected)
 * 3. `BETTER_AUTH_URL` env var (BetterAuth standard, for backward compatibility)
 */
function resolveBaseURL(explicitBaseURL?: string): string | undefined {
	return explicitBaseURL ?? process.env.AGENTUITY_DEPLOYMENT_URL ?? process.env.BETTER_AUTH_URL;
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
 * - Trusts the AGENTUITY_DEPLOYMENT_URL origin
 * - Trusts the same-origin of incoming requests (request.url.origin)
 * - Supports additional origins via AGENTUITY_AUTH_TRUSTED_ORIGINS env (comma-separated)
 *
 * @param baseURL - The resolved base URL for the auth instance
 */
function createDefaultTrustedOrigins(baseURL?: string): (request?: Request) => Promise<string[]> {
	const agentuityURL = process.env.AGENTUITY_DEPLOYMENT_URL;
	const extraFromEnv = process.env.AGENTUITY_AUTH_TRUSTED_ORIGINS;

	const staticOrigins = new Set<string>();

	const baseOrigin = safeOrigin(baseURL);
	if (baseOrigin) staticOrigins.add(baseOrigin);

	const agentuityOrigin = safeOrigin(agentuityURL);
	if (agentuityOrigin) staticOrigins.add(agentuityOrigin);

	if (extraFromEnv) {
		for (const raw of extraFromEnv.split(',')) {
			const v = raw.trim();
			if (v) staticOrigins.add(v);
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
 * API extensions added by the organization plugin.
 */
export interface OrganizationApiMethods {
	createOrganization: (params: {
		body: { name: string; slug: string; logo?: string; metadata?: Record<string, unknown> };
		headers?: Headers;
	}) => Promise<{ id: string; name: string; slug: string; logo?: string; createdAt: Date }>;

	listOrganizations: (params: { headers?: Headers }) => Promise<
		Array<{
			id: string;
			name: string;
			slug: string;
			logo?: string;
		}>
	>;

	getFullOrganization: (params: { headers?: Headers }) => Promise<{
		id: string;
		name: string;
		slug: string;
		logo?: string;
		members?: Array<{ userId: string; role: string }>;
	} | null>;

	setActiveOrganization: (params: {
		body: { organizationId: string };
		headers?: Headers;
	}) => Promise<{ id: string; name: string; slug: string }>;

	createInvitation: (params: {
		body: { organizationId: string; email: string; role?: string };
		headers?: Headers;
	}) => Promise<{ id: string; email: string; role: string; organizationId: string }>;

	cancelInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	rejectInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	acceptInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	removeMember: (params: {
		body: { memberIdOrEmail: string; organizationId?: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	updateMemberRole: (params: {
		body: { memberId: string; role: string; organizationId?: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	checkSlug: (params: {
		body: { slug: string };
		headers?: Headers;
	}) => Promise<{ exists: boolean }>;
}

/**
 * API extensions added by the API Key plugin.
 */
export interface ApiKeyApiMethods {
	createApiKey: (params: {
		body: {
			name?: string;
			expiresIn?: number;
			prefix?: string;
			userId?: string;
			remaining?: number;
			metadata?: Record<string, unknown>;
			refillAmount?: number;
			refillInterval?: number;
			rateLimitTimeWindow?: number;
			rateLimitMax?: number;
			rateLimitEnabled?: boolean;
		};
		headers?: Headers;
	}) => Promise<{
		id: string;
		name: string;
		key: string;
		expiresAt?: Date;
		createdAt: Date;
	}>;

	listApiKeys: (params: { headers?: Headers }) => Promise<
		Array<{
			id: string;
			name: string;
			start: string;
			expiresAt?: Date;
			createdAt: Date;
		}>
	>;

	deleteApiKey: (params: {
		body: { keyId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	verifyApiKey: (params: { body: { key: string }; headers?: Headers }) => Promise<{
		valid: boolean;
		error?: { message: string; code: string } | null;
		key?: {
			id: string;
			name: string;
			userId: string;
			permissions?: Record<string, string[]> | null;
		} | null;
	}>;
}

/**
 * API extensions added by the JWT plugin.
 */
export interface JwtApiMethods {
	getToken: (params: { headers?: Headers }) => Promise<{ token: string }>;
}

/**
 * Combined API extensions from all default plugins.
 */
export type DefaultPluginApiMethods = OrganizationApiMethods & ApiKeyApiMethods & JwtApiMethods;

/**
 * API Key plugin configuration options.
 */
export interface ApiKeyPluginOptions {
	/**
	 * Whether to enable API key authentication.
	 * Defaults to true.
	 */
	enabled?: boolean;

	/**
	 * Header names to check for API key.
	 * Defaults to ['x-agentuity-auth-api-key', 'X-Agentuity-Auth-Api-Key'].
	 */
	apiKeyHeaders?: string[];

	/**
	 * Whether API keys should create mock sessions for the user.
	 * This allows API key auth to work seamlessly with session-based middleware.
	 * Defaults to true.
	 */
	enableSessionForAPIKeys?: boolean;

	/**
	 * Default prefix for generated API keys.
	 * Defaults to 'ag_'.
	 */
	defaultPrefix?: string;

	/**
	 * Default length for generated API keys (excluding prefix).
	 * Defaults to 64.
	 */
	defaultKeyLength?: number;

	/**
	 * Whether to enable metadata storage on API keys.
	 * Defaults to true.
	 */
	enableMetadata?: boolean;
}

/**
 * Configuration options for auth.
 * Extends BetterAuth options with Agentuity-specific settings.
 */
export interface AuthOptions extends BetterAuthOptions {
	/**
	 * PostgreSQL connection string.
	 * When provided, we create a Bun SQL connection and Drizzle instance internally.
	 * This is the simplest path - just provide the connection string.
	 *
	 * @example
	 * ```typescript
	 * createAgentuityAuth({
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
 * Default API key plugin options.
 */
export const DEFAULT_API_KEY_OPTIONS: Required<ApiKeyPluginOptions> = {
	enabled: true,
	apiKeyHeaders: ['x-agentuity-auth-api-key', 'X-Agentuity-Auth-Api-Key'],
	enableSessionForAPIKeys: true,
	defaultPrefix: 'ag_',
	defaultKeyLength: 64,
	enableMetadata: true,
};

/**
 * Default plugins included with Agentuity auth.
 *
 * @param apiKeyOptions - API key plugin options, or false to disable
 */
export function getDefaultPlugins(apiKeyOptions?: ApiKeyPluginOptions | false) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const plugins: any[] = [organization(), jwt(), bearer()];

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

	// Explicitly type to avoid union type inference issues with downstream consumers
	const trustedOrigins: TrustedOrigins =
		restOptions.trustedOrigins ?? createDefaultTrustedOrigins(resolvedBaseURL);

	const defaultPlugins = skipDefaultPlugins ? [] : getDefaultPlugins(apiKeyOptions);

	// Handle database configuration
	let database = restOptions.database;

	// ConnectionString provided - create Bun SQL connection + drizzle internally
	if (connectionString && !database) {
		const db = drizzle(connectionString, { schema: authSchema });
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
