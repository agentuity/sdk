/**
 * Clerk authentication provider for Agentuity.
 *
 * Provides both client-side (React) and server-side (Hono) authentication.
 *
 * @example Client-side
 * ```tsx
 * import { ClerkProvider, useAuth } from '@clerk/clerk-react';
 * import { AgentuityProvider } from '@agentuity/react';
 * import { AgentuityClerk } from '@agentuity/auth/clerk';
 *
 * <ClerkProvider publishableKey={key}>
 *   <AgentuityProvider>
 *     <AgentuityClerk useAuth={useAuth}>
 *       <App />
 *     </AgentuityClerk>
 *   </AgentuityProvider>
 * </ClerkProvider>
 * ```
 *
 * @example Server-side
 * ```typescript
 * import { createMiddleware } from '@agentuity/auth/clerk';
 *
 * router.get('/api/profile', createMiddleware(), async (c) => {
 *   const user = await c.var.auth.getUser();
 *   return c.json({ email: user.email });
 * });
 * ```
 *
 * @module clerk
 */

export { AgentuityClerk } from './client';
export type { AgentuityClerkProps } from './client';
export { createMiddleware } from './server';
export type { ClerkMiddlewareOptions, ClerkJWTPayload, ClerkEnv } from './server';
