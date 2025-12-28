/**
 * Agentuity BetterAuth configuration.
 *
 * This is the single source of truth for authentication in this project.
 * All auth tables are stored in your Postgres database.
 */

import { Pool } from 'pg';
import {
	createAgentuityAuth,
	createSessionMiddleware,
	createApiKeyMiddleware,
} from '@agentuity/auth/agentuity';

/**
 * Database URL for authentication.
 *
 * Set via DATABASE_URL environment variable.
 * Get yours from: `agentuity cloud database list --region use --json`
 */
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is required for authentication');
}

/**
 * BetterAuth secret for signing tokens and encrypting data.
 * Must be at least 32 characters.
 * Generate with: openssl rand -hex 32
 */
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;

if (!BETTER_AUTH_SECRET) {
	throw new Error('BETTER_AUTH_SECRET environment variable is required');
}

/**
 * PostgreSQL connection pool for BetterAuth.
 */
const pool = new Pool({
	connectionString: DATABASE_URL,
});

/**
 * BetterAuth instance with Agentuity defaults.
 *
 * Default plugins included:
 * - organization (multi-tenancy)
 * - jwt (token signing)
 * - bearer (API auth)
 * - apiKey (programmatic access)
 */
export const auth = createAgentuityAuth({
	database: pool,
	secret: BETTER_AUTH_SECRET,
	basePath: '/api/auth',
	emailAndPassword: {
		enabled: true,
	},
});

/**
 * Session middleware - validates cookies/bearer tokens.
 * Use for routes that require authentication.
 */
export const authMiddleware = createSessionMiddleware(auth);

/**
 * Optional auth middleware - allows anonymous access.
 */
export const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });

/**
 * API key middleware for programmatic access.
 * Use for webhook endpoints or external integrations.
 */
export const apiKeyMiddleware = createApiKeyMiddleware(auth);

/**
 * Type export for end-to-end type safety.
 */
export type Auth = typeof auth;
