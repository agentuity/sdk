/**
 * @agentuity/auth - Authentication for Agentuity projects
 *
 * Provides first-class authentication powered by BetterAuth.
 *
 * This is the server-only entry point. For React components, import from '@agentuity/auth/react'.
 *
 * @example Server-side setup
 * ```typescript
 * import { createAuth, createSessionMiddleware, mountAuthRoutes } from '@agentuity/auth';
 *
 * const auth = createAuth({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * api.on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth));
 * api.use('/api/*', createSessionMiddleware(auth));
 * ```
 *
 * @example Client-side setup
 * ```tsx
 * import { createAuthClient, AuthProvider } from '@agentuity/auth/react';
 *
 * const authClient = createAuthClient();
 *
 * <AgentuityProvider>
 *   <AuthProvider authClient={authClient}>
 *     <App />
 *   </AuthProvider>
 * </AgentuityProvider>
 * ```
 *
 * @module @agentuity/auth
 */

// =============================================================================
// Config
// =============================================================================

export { createAuth, getDefaultPlugins, DEFAULT_API_KEY_OPTIONS } from './agentuity/config';
export type {
	AuthOptions,
	AuthInstance,
	AuthBase,
	ApiKeyPluginOptions,
	OrganizationApiMethods,
	ApiKeyApiMethods,
	JwtApiMethods,
	DefaultPluginApiMethods,
} from './agentuity/config';

// =============================================================================
// Server (Hono middleware and handlers)
// =============================================================================

export {
	createSessionMiddleware,
	createApiKeyMiddleware,
	mountAuthRoutes,
} from './agentuity/server';
export type {
	AuthMiddlewareOptions,
	ApiKeyMiddlewareOptions,
	AuthEnv,
	OtelSpansConfig,
	MountAuthRoutesOptions,
} from './agentuity/server';

// =============================================================================
// Types
// =============================================================================

export type {
	AuthContext,
	AuthOrgContext,
	AuthApiKeyContext,
	AuthApiKeyPermissions,
	AuthMethod,
	AuthOrgHelpers,
	AuthApiKeyHelpers,
	AuthInterface,
	AuthUser,
	AuthSession,
} from './agentuity/types';

export type { AgentuityAuth } from './types';
