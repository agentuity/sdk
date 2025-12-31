/**
 * Auth configuration.
 *
 * This is the single source of truth for authentication in this project.
 * All auth tables are stored in your Postgres database.
 */

import { createAuth } from '@agentuity/auth';

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
 * Auth instance with sensible defaults.
 *
 * Defaults:
 * - basePath: '/api/auth'
 * - emailAndPassword: { enabled: true }
 * - Uses AGENTUITY_AUTH_SECRET env var for signing
 *
 * Default plugins included:
 * - organization (multi-tenancy)
 * - jwt (token signing)
 * - bearer (API auth)
 * - apiKey (programmatic access)
 */
export const auth = createAuth({
	// Simplest setup: just provide the connection string
	// We create pg pool + Drizzle internally with joins enabled
	connectionString: DATABASE_URL,
	// All options below have sensible defaults and can be omitted:
	// secret: process.env.AGENTUITY_AUTH_SECRET, // auto-resolved from env
	// basePath: '/api/auth', // default
	// emailAndPassword: { enabled: true }, // default
});

/**
 * Type export for end-to-end type safety.
 */
export type Auth = typeof auth;
