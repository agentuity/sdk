/**
 * @agentuity/auth - Authentication for Agentuity projects
 *
 * Provides first-class authentication using Agentuity Auth (powered by BetterAuth).
 *
 * This is the server-only entry point. For React components, import from '@agentuity/auth/react'.
 *
 * @example Server-side setup
 * ```typescript
 * import { createAgentuityAuth, createSessionMiddleware, mountAgentuityAuthRoutes } from '@agentuity/auth';
 *
 * const auth = createAgentuityAuth({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * api.on(['GET', 'POST'], '/api/auth/*', mountAgentuityAuthRoutes(auth));
 * api.use('/api/*', createSessionMiddleware(auth));
 * ```
 *
 * @example Client-side setup
 * ```tsx
 * import { createAgentuityAuthClient, AgentuityAuthProvider } from '@agentuity/auth/react';
 *
 * const authClient = createAgentuityAuthClient();
 *
 * <AgentuityProvider>
 *   <AgentuityAuthProvider authClient={authClient}>
 *     <App />
 *   </AgentuityAuthProvider>
 * </AgentuityProvider>
 * ```
 *
 * @module @agentuity/auth
 */

// =============================================================================
// Config
// =============================================================================

export {
	createAgentuityAuth,
	withAgentuityAuth,
	getDefaultPlugins,
	DEFAULT_API_KEY_OPTIONS,
} from './agentuity/config';
export type {
	AgentuityAuthOptions,
	AgentuityAuthInstance,
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
	mountAgentuityAuthRoutes,
} from './agentuity/server';
export type {
	AgentuityMiddlewareOptions,
	AgentuityApiKeyMiddlewareOptions,
	AgentuityAuthEnv,
	OtelSpansConfig,
	MountAgentuityAuthRoutesOptions,
} from './agentuity/server';

// =============================================================================
// Types
// =============================================================================

export type {
	AgentuityAuthContext,
	AgentuityOrgContext,
	AgentuityApiKeyContext,
	AgentuityApiKeyPermissions,
	AgentuityAuthMethod,
	AgentuityOrgHelpers,
	AgentuityApiKeyHelpers,
	AgentuityAuthInterface,
} from './agentuity/types';

export type { AgentuityAuth, AgentuityAuthUser } from './types';
