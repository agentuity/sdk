/**
 * Agentuity BetterAuth integration.
 *
 * First-class authentication for Agentuity projects using BetterAuth.
 *
 * @module agentuity
 *
 * @example Server-side setup
 * ```typescript
 * // auth.ts
 * import { createAgentuityAuth, createMiddleware, ensureAuthSchema } from '@agentuity/auth/agentuity';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *
 * // Auto-create auth tables if they don't exist
 * await ensureAuthSchema({ db: pool });
 *
 * export const auth = createAgentuityAuth({
 *   database: pool,
 *   basePath: '/api/auth',
 * });
 *
 * export const authMiddleware = createMiddleware(auth);
 * ```
 *
 * @example Agent with auth
 * ```typescript
 * import { createAgent } from '@agentuity/runtime';
 * import { withSession } from '@agentuity/auth/agentuity';
 *
 * export default createAgent('my-agent', {
 *   handler: withSession(async (ctx, { auth, org }, input) => {
 *     if (!auth) return { error: 'Not authenticated' };
 *     return { userId: auth.user.id };
 *   }, { optional: true }),
 * });
 * ```
 *
 * @example Client-side setup
 * ```tsx
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityBetterAuth } from '@agentuity/auth/agentuity';
 *
 * <AgentuityProvider>
 *   <AgentuityBetterAuth>
 *     <App />
 *   </AgentuityBetterAuth>
 * </AgentuityProvider>
 * ```
 */

// =============================================================================
// Config
// =============================================================================

export {
	createAgentuityAuth,
	withAgentuityAuth,
	getDefaultPlugins,
	DEFAULT_API_KEY_OPTIONS,
} from './config';
export type {
	AgentuityAuthOptions,
	AgentuityAuthInstance,
	ApiKeyPluginOptions,
	OrganizationApiMethods,
	ApiKeyApiMethods,
	JwtApiMethods,
	DefaultPluginApiMethods,
} from './config';

// =============================================================================
// Migrations
// =============================================================================

export { ensureAuthSchema, AGENTUITY_AUTH_BASELINE_SQL } from './migrations';
export type { DatabaseClient, EnsureAuthSchemaOptions, EnsureAuthSchemaResult } from './migrations';

// =============================================================================
// Server (Hono middleware and handlers)
// =============================================================================

export {
	createSessionMiddleware,
	createApiKeyMiddleware,
	createMiddleware,
	mountBetterAuthRoutes,
} from './server';
export type {
	AgentuityMiddlewareOptions,
	AgentuityApiKeyMiddlewareOptions,
	AgentuityAuthEnv,
	OtelSpansConfig,
	MountBetterAuthRoutesOptions,
} from './server';

// =============================================================================
// Client (React)
// =============================================================================

export { AgentuityBetterAuth } from './client';
export type { AgentuityBetterAuthProps } from './client';

// =============================================================================
// Agent Wrappers
// =============================================================================

export { withSession } from './agent';

// =============================================================================
// Types
// =============================================================================

export type {
	AgentuityAuthContext,
	AgentuityOrgContext,
	AgentuityApiKeyContext,
	AgentuityApiKeyPermissions,
	AgentuityAuthMethod,
	AgentuityBetterAuthAuth,
	AgentuityOrgHelpers,
	AgentuityApiKeyHelpers,
	WithSessionOptions,
	WithSessionContext,
} from './types';
