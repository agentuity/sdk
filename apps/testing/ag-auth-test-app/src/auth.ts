/**
 * Agentuity BetterAuth configuration.
 *
 * This is the single source of truth for authentication in this project.
 * All auth tables are stored in the developer's Postgres database.
 */

import { Pool } from 'pg';
import { createAgentuityAuth, createMiddleware } from '@agentuity/auth/agentuity';

/**
 * Database URL for authentication.
 *
 * Set via DATABASE_URL environment variable.
 * For local development, use the Agentuity cloud database:
 *   `agentuity cloud database list --region use --json`
 */
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is required for authentication');
}

/**
 * BetterAuth secret for signing tokens and encrypting data.
 * Must be at least 32 characters.
 */
const BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET || 'agentuity-dev-secret-at-least-32-chars';

/**
 * PostgreSQL connection pool for BetterAuth.
 */
const pool = new Pool({
	connectionString: DATABASE_URL,
});

/**
 * Ensure auth tables exist (idempotent - safe to call on every startup).
 * This creates all BetterAuth tables if they don't exist:
 * - user, session, account, verification (core)
 * - organization, member, invitation (org plugin)
 * - jwks (JWT plugin)
 * - apiKey (API key plugin)
 */
// Note: In production, you might want to run this separately during deployment
// await ensureAuthSchema({ db: pool });

/**
 * BetterAuth instance with Agentuity defaults.
 *
 * Default plugins included:
 * - organization (multi-tenancy)
 * - jwt (token signing)
 * - bearer (API auth)
 * - apiKey (programmatic access with enableSessionForAPIKeys)
 *
 * Add more plugins as needed:
 * ```typescript
 * import { twoFactor } from 'better-auth/plugins';
 *
 * export const auth = createAgentuityAuth({
 *   database: pool,
 *   plugins: [twoFactor()],
 * });
 * ```
 */
export const auth = createAgentuityAuth({
	database: pool,
	secret: BETTER_AUTH_SECRET,
	basePath: '/api/auth',
	emailAndPassword: {
		enabled: true,
	},
	// Use database storage for API keys in this demo app
	// In production, configure secondaryStorage with createAgentuityApiKeyStorage for KV-backed storage
	apiKey: {
		storage: 'database',
	},
});

/**
 * Hono middleware for protected routes.
 * Works with both session cookies and API keys (enableSessionForAPIKeys).
 *
 * Usage:
 * ```typescript
 * import { authMiddleware } from './auth';
 *
 * app.use('/api/*', authMiddleware);
 * ```
 */
export const authMiddleware = createMiddleware(auth);

/**
 * Optional auth middleware - allows both authenticated and anonymous requests.
 */
export const optionalAuthMiddleware = createMiddleware(auth, { optional: true });

/**
 * Type exports for end-to-end type safety.
 */
export type Auth = typeof auth;
