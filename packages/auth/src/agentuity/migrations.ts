/**
 * Agentuity BetterAuth database migrations.
 *
 * Provides baseline SQL schema and runtime migration helpers for BetterAuth
 * with Agentuity's default plugins (organization, JWT, bearer, API key).
 *
 * @module agentuity/migrations
 */

/**
 * Baseline SQL schema for BetterAuth + Agentuity extensions.
 *
 * This includes:
 * - BetterAuth core tables (user, session, account, verification)
 * - Organization plugin tables (organization, member, invitation)
 * - JWT plugin table (jwks)
 * - API Key plugin table (apiKey)
 *
 * All statements use "IF NOT EXISTS" for idempotent execution.
 */
export const AGENTUITY_AUTH_BASELINE_SQL = `
-- =============================================================================
-- BetterAuth Core Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "activeOrganizationId" text
);

-- SECURITY: The "account" table stores OAuth provider tokens and optional passwords.
-- - accessToken, refreshToken, idToken: OAuth tokens from identity providers. Treat as sensitive.
-- - password: Hashed user password (when using email/password auth).
-- - Restrict direct database access to this table; never expose these fields via APIs or logs.
-- - Consider at-rest encryption for production deployments with sensitive OAuth integrations.
CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- =============================================================================
-- Organization Plugin Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS "organization" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "logo" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" text
);

CREATE TABLE IF NOT EXISTS "member" (
  "id" text NOT NULL PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" text NOT NULL PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text,
  "status" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "inviterId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

-- =============================================================================
-- JWT Plugin Table
-- =============================================================================
-- SECURITY: The "jwks" table stores JWT signing keys.
-- - privateKey: Contains the private key used for signing JWTs. BetterAuth encrypts this
--   by default using the BETTER_AUTH_SECRET. Never disable encryption in production.
-- - Restrict database access to this table; never expose private keys in logs or APIs.
-- - Rotate keys periodically by allowing old keys to expire (via expiresAt) and creating new ones.

CREATE TABLE IF NOT EXISTS "jwks" (
  "id" text NOT NULL PRIMARY KEY,
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" timestamptz
);

-- =============================================================================
-- API Key Plugin Table
-- Note: BetterAuth expects lowercase table name "apikey" (not "apiKey")
-- =============================================================================
-- SECURITY: The "apikey" table stores API keys for programmatic access.
-- - key: Stores a HASHED version of the API key (not plaintext). BetterAuth hashes keys
--   before storage. The original key is only shown once at creation time.
-- - Restrict database access; never expose this table in admin UIs or logs.
-- - Use the permissions column to implement least-privilege access patterns.

CREATE TABLE IF NOT EXISTS apikey (
  id text NOT NULL PRIMARY KEY,
  name text,
  start text,
  prefix text,
  key text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  "refillInterval" integer,
  "refillAmount" integer,
  "lastRefillAt" timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  "rateLimitEnabled" boolean NOT NULL DEFAULT true,
  "rateLimitTimeWindow" integer NOT NULL DEFAULT 86400000,
  "rateLimitMax" integer NOT NULL DEFAULT 10,
  "requestCount" integer NOT NULL DEFAULT 0,
  remaining integer,
  "lastRequest" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  permissions text,
  metadata text
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS session_userId_idx ON session ("userId");
CREATE INDEX IF NOT EXISTS account_userId_idx ON account ("userId");
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);
CREATE INDEX IF NOT EXISTS member_organizationId_idx ON member ("organizationId");
CREATE INDEX IF NOT EXISTS member_userId_idx ON member ("userId");
CREATE INDEX IF NOT EXISTS invitation_organizationId_idx ON invitation ("organizationId");
CREATE INDEX IF NOT EXISTS invitation_email_idx ON invitation (email);
CREATE INDEX IF NOT EXISTS apikey_userId_idx ON apikey ("userId");
CREATE INDEX IF NOT EXISTS apikey_key_idx ON apikey (key);
`;

/**
 * Database client interface for migrations.
 * Compatible with pg.Pool, pg.Client, or any client with a query method.
 */
export interface DatabaseClient {
	query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Options for ensureAuthSchema.
 */
export interface EnsureAuthSchemaOptions {
	/** Database client with query method (e.g., pg.Pool) */
	db: DatabaseClient;
}

/**
 * Result of ensureAuthSchema operation.
 */
export interface EnsureAuthSchemaResult {
	/** Always true - schema SQL was executed */
	created: boolean;
}

/**
 * Idempotent helper to ensure the auth schema exists.
 *
 * Runs the full baseline SQL schema. All statements use IF NOT EXISTS,
 * making this safe to call on every application startup.
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { ensureAuthSchema } from '@agentuity/auth/agentuity';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *
 * // Call at startup - safe to run multiple times
 * const { created } = await ensureAuthSchema({ db: pool });
 * if (created) {
 *   console.log('Auth schema created');
 * }
 * ```
 */
export async function ensureAuthSchema(
	options: EnsureAuthSchemaOptions
): Promise<EnsureAuthSchemaResult> {
	const { db } = options;

	// All statements use IF NOT EXISTS - safe and idempotent to run every time
	// This ensures any new tables (from updated plugins) are always created
	await db.query(AGENTUITY_AUTH_BASELINE_SQL);

	return { created: true };
}
