/**
 * @agentuity/auth - Authentication helpers for identity providers
 *
 * Currently supports Clerk, with more providers coming soon.
 *
 * @example Clerk Integration
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
