/**
 * @agentuity/auth - Authentication helpers for popular identity providers
 *
 * Provides drop-in authentication for Agentuity applications using
 * popular providers like Clerk, WorkOS, Auth0, and Better Auth.
 *
 * @example
 * ```typescript
 * // Client-side (React)
 * import { AgentuityClerk } from '@agentuity/auth/clerk';
 *
 * // Server-side (Hono)
 * import { createMiddleware } from '@agentuity/auth/clerk';
 * ```
 *
 * @module @agentuity/auth
 */

export type { AgentuityAuthUser, AgentuityAuth } from './types';
