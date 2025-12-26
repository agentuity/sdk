/**
 * Shared helpers for Agentuity Auth setup
 */

import { listResources, createResources, dbQuery } from '@agentuity/server';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import type { Logger } from '../../../types';
import type { AuthData } from '../../../types';
import enquirer from 'enquirer';

/**
 * Database info returned from selection
 */
export interface DatabaseInfo {
	name: string;
	url: string;
}

/**
 * Select an existing database or create a new one
 */
export async function selectOrCreateDatabase(options: {
	logger: Logger;
	auth: AuthData;
	orgId: string;
	region: string;
	existingUrl?: string;
}): Promise<DatabaseInfo> {
	const { logger, auth, orgId, region, existingUrl } = options;
	const catalystClient = getCatalystAPIClient(logger, auth, region);

	const resources = await tui.spinner({
		message: `Fetching databases for ${orgId} in ${region}`,
		clearOnSuccess: true,
		callback: async () => listResources(catalystClient, orgId, region),
	});

	const databases = resources.db;

	// Extract existing database name from URL if provided
	let existingDbName: string | undefined;
	if (existingUrl) {
		const urlMatch = existingUrl.match(/\/([^/?]+)(\?|$)/);
		if (urlMatch) {
			existingDbName = urlMatch[1];
		}
	}

	type Choice = { name: string; message: string };
	const choices: Choice[] = [];

	// Add "use existing" option first if we have an existing URL
	if (existingUrl && existingDbName) {
		choices.push({
			name: '__existing__',
			message: `${tui.tuiColors.success('✓')} Use existing (found in .env): ${existingDbName}`,
		});
	}

	// Add create new option
	choices.push({ name: '__create__', message: tui.bold('+ Create new database') });

	// Add other databases
	choices.push(
		...databases
			.filter((db) => db.name !== existingDbName) // Don't duplicate existing
			.map((db) => ({
				name: db.name,
				message: db.name,
			}))
	);

	const response = await enquirer.prompt<{ database: string }>({
		type: 'select',
		name: 'database',
		message: 'Select a database for auth:',
		choices,
	});

	// Handle "use existing" selection
	if (response.database === '__existing__' && existingUrl && existingDbName) {
		return { name: existingDbName, url: existingUrl };
	}

	if (response.database === '__create__') {
		const created = await tui.spinner({
			message: `Creating database in ${region}`,
			clearOnSuccess: true,
			callback: async () => createResources(catalystClient, orgId, region, [{ type: 'db' }]),
		});

		if (created.length === 0) {
			tui.fatal('Failed to create database');
		}

		const newDb = created[0];
		tui.success(`Created database: ${tui.bold(newDb.name)}`);

		const updatedResources = await listResources(catalystClient, orgId, region);
		const dbInfo = updatedResources.db.find((d) => d.name === newDb.name);

		if (!dbInfo?.url) {
			tui.fatal('Failed to retrieve database connection URL');
		}

		return { name: newDb.name, url: dbInfo.url };
	}

	const selectedDb = databases.find((d) => d.name === response.database);
	if (!selectedDb?.url) {
		tui.fatal('Failed to retrieve database connection URL');
	}

	return { name: selectedDb.name, url: selectedDb.url };
}

/**
 * Required auth dependencies
 */
export const AUTH_DEPENDENCIES = {
	'@agentuity/auth': 'latest',
	'better-auth': '^1.2.0',
	pg: '^8.13.0',
} as const;

/**
 * Check and install auth dependencies
 */
export async function ensureAuthDependencies(options: {
	projectDir: string;
	logger: Logger;
}): Promise<boolean> {
	const { projectDir } = options;
	const fs = await import('fs');
	const path = await import('path');

	const packageJsonPath = path.join(projectDir, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		tui.fatal('No package.json found in project directory');
	}

	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
	const deps = packageJson.dependencies || {};

	const missingDeps: string[] = [];

	for (const [dep, version] of Object.entries(AUTH_DEPENDENCIES)) {
		if (!deps[dep]) {
			missingDeps.push(`${dep}@${version}`);
		}
	}

	if (missingDeps.length === 0) {
		return false;
	}

	tui.info(`Installing auth dependencies: ${missingDeps.join(', ')}`);

	const { spawn } = await import('child_process');

	await new Promise<void>((resolve, reject) => {
		const proc = spawn('bun', ['install', ...missingDeps], {
			cwd: projectDir,
			stdio: 'inherit',
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`bun install failed with code ${code}`));
			}
		});

		proc.on('error', reject);
	});

	tui.success('Dependencies installed');
	return true;
}

/**
 * The baseline SQL for Agentuity Auth tables
 * This is the same SQL used by ensureAuthSchema() in @agentuity/auth
 */
export const AGENTUITY_AUTH_BASELINE_SQL = `
-- Agentuity Auth baseline schema (BetterAuth + plugins)
-- This SQL is idempotent (uses IF NOT EXISTS)

-- Core BetterAuth tables
CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT UNIQUE NOT NULL,
    "emailVerified" BOOLEAN DEFAULT FALSE,
    "image" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "token" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "expiresAt" TIMESTAMP NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "activeOrganizationId" TEXT
);

CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Organization plugin tables
CREATE TABLE IF NOT EXISTS "organization" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT UNIQUE,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "member" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "organizationId" TEXT NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "invitation" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT 'member',
    "inviterId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- JWT plugin table
CREATE TABLE IF NOT EXISTS "jwks" (
    "id" TEXT PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- API Key plugin table
CREATE TABLE IF NOT EXISTS "apiKey" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "start" TEXT,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP,
    "enabled" BOOLEAN DEFAULT TRUE,
    "rateLimitEnabled" BOOLEAN DEFAULT FALSE,
    "rateLimitTimeWindow" INTEGER,
    "rateLimitMax" INTEGER,
    "requestCount" INTEGER DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP,
    "expiresAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "permissions" TEXT,
    "metadata" TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "session_token_idx" ON "session"("token");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");
CREATE INDEX IF NOT EXISTS "member_userId_idx" ON "member"("userId");
CREATE INDEX IF NOT EXISTS "member_organizationId_idx" ON "member"("organizationId");
CREATE INDEX IF NOT EXISTS "apiKey_userId_idx" ON "apiKey"("userId");
CREATE INDEX IF NOT EXISTS "apiKey_key_idx" ON "apiKey"("key");
`;

/**
 * Split SQL into individual statements for sequential execution
 * The dbQuery API only supports single statements
 */
export function splitSqlStatements(sql: string): string[] {
	// Split on semicolons, but be careful about edge cases
	const statements: string[] = [];
	let current = '';

	for (const line of sql.split('\n')) {
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith('--')) {
			continue;
		}

		current += line + '\n';

		// If line ends with semicolon, it's end of statement
		if (trimmed.endsWith(';')) {
			const stmt = current.trim();
			if (stmt && stmt !== ';') {
				statements.push(stmt);
			}
			current = '';
		}
	}

	// Handle any remaining content
	if (current.trim()) {
		statements.push(current.trim());
	}

	return statements;
}

/**
 * Run auth migrations against a database
 */
export async function runAuthMigrations(options: {
	logger: Logger;
	auth: AuthData;
	orgId: string;
	region: string;
	databaseName: string;
}): Promise<void> {
	const { logger, auth, orgId, region, databaseName } = options;
	const catalystClient = getCatalystAPIClient(logger, auth, region);

	// Split into individual statements since dbQuery only supports single statements
	const statements = splitSqlStatements(AGENTUITY_AUTH_BASELINE_SQL);

	await tui.spinner({
		message: `Running auth migrations on ${databaseName} (${statements.length} statements)`,
		clearOnSuccess: true,
		callback: async () => {
			for (const statement of statements) {
				await dbQuery(catalystClient, {
					database: databaseName,
					query: statement,
					orgId,
					region,
				});
			}
		},
	});

	tui.success(`Auth tables created in ${tui.bold(databaseName)}`);
}

/**
 * Generate the auth.ts file content
 */
export function generateAuthFileContent(): string {
	return `import { Pool } from 'pg';
import {
	createAgentuityAuth,
	createMiddleware,
} from '@agentuity/auth/agentuity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const auth = createAgentuityAuth({
	database: pool,
	basePath: '/api/auth',
});

export const authMiddleware = createMiddleware(auth);
`;
}

/**
 * Print integration examples to the console
 */
export function printIntegrationExamples(): void {
	tui.newline();
	tui.info(tui.bold('Next Steps - Add these to your project:'));
	tui.newline();

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 1. Add auth middleware to your Hono app:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { authMiddleware } from './auth';

app.use('/api/*', authMiddleware);
`);

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 2. Add BetterAuth routes:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
// In your API routes (e.g., src/api/index.ts)
import { auth } from '../auth';

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
`);

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 3. Wrap your React app with AuthProvider:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { AgentuityBetterAuth } from '@agentuity/auth/agentuity/client';

function App() {
  return (
    <AgentuityBetterAuth>
      {/* your app */}
    </AgentuityBetterAuth>
  );
}
`);

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 4. Protect agents with withSession:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { withSession } from '@agentuity/auth/agentuity';

export default createAgent({
  handler: withSession(async ({ auth }, input) => {
    const user = await auth.getUser();
    // ...
  }),
});
`);

	tui.newline();
	console.log(tui.muted('━'.repeat(60)));
	tui.info('Checklist:');
	console.log(`  ${tui.tuiColors.success('✓')} DATABASE_URL configured`);
	console.log(`  ${tui.tuiColors.success('✓')} Auth tables migrated`);
	console.log(`  ${tui.tuiColors.success('✓')} Dependencies installed`);
	console.log(`  ${tui.muted('○')} Wire Hono middleware`);
	console.log(`  ${tui.muted('○')} Add auth routes`);
	console.log(`  ${tui.muted('○')} Wrap app with AuthProvider`);
	tui.newline();
}
