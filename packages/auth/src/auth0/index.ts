/**
 * Auth0 authentication provider for Agentuity.
 *
 * Provides client-side (React) and server-side (Hono) authentication.
 *
 * @example Client-side
 * ```tsx
 * import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityAuth0 } from '@agentuity/auth/auth0';
 *
 * <Auth0Provider domain={domain} clientId={clientId} authorizationParams={{ redirect_uri: window.location.origin }}>
 *   <AgentuityProvider>
 *     <AgentuityAuth0 useAuth0={useAuth0}>
 *       <App />
 *     </AgentuityAuth0>
 *   </AgentuityProvider>
 * </Auth0Provider>
 * ```
 *
 * @example Server-side
 * ```typescript
 * import { createMiddleware } from '@agentuity/auth/auth0/server';
 *
 * router.get('/api/profile', createMiddleware(), async (c) => {
 *   const user = await c.var.auth.requireUser();
 *   return c.json({ email: user.email });
 * });
 * ```
 *
 * @module auth0
 */

// Client-side exports (safe for browser)
export { AgentuityAuth0 } from './client';
export type { AgentuityAuth0Props } from './client';

// Server-side exports are NOT exported from the main index to prevent bundling server deps in frontend
// Import server code directly from '@agentuity/auth/auth0/server' instead
// This ensures jsonwebtoken/jwks-rsa are never bundled into browser code
