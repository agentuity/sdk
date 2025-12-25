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
 * import { createAgentuityAuth, createHonoMiddleware } from '@agentuity/auth/agentuity';
 *
 * export const auth = createAgentuityAuth({
 *   database: { url: process.env.DATABASE_URL! },
 *   basePath: '/auth',
 * });
 *
 * export const authMiddleware = createHonoMiddleware(auth);
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

// Config
export { createAgentuityAuth, getDefaultPlugins } from './config';
export type { AgentuityAuthOptions, AgentuityAuthInstance } from './config';

// Server (Hono middleware)
export { createHonoMiddleware } from './server';
export type { AgentuityMiddlewareOptions, AgentuityAuthEnv } from './server';

// Client (React)
export { AgentuityBetterAuth } from './client';
export type { AgentuityBetterAuthProps } from './client';

// Agent wrappers
export { withAuth, createScopeChecker } from './agent';
export type { AgentAuthContext } from './agent';

// Types
export type { AgentuityAuthContext, WithAuthOptions, AuthenticatedHandler } from './types';
