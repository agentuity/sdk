/**
 * Shared helpers for Agentuity Auth setup
 */

import * as path from 'node:path';
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
	'better-auth': '^1.4.9',
	'drizzle-orm': '^0.44.0',
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

	const proc = Bun.spawn(['bun', 'install', ...missingDeps], {
		cwd: projectDir,
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`bun install failed with code ${exitCode}`);
	}

	tui.success('Dependencies installed');
	return true;
}

/**
 * ORM setup type detected in a project.
 */
export type OrmSetup = 'drizzle' | 'prisma' | 'none';

/**
 * Get the directory for generated SQL files.
 * Uses src/generated/ if it exists, otherwise falls back to project root.
 */
export async function getGeneratedSqlDir(projectDir: string): Promise<string> {
	const generatedDir = path.join(projectDir, 'src', 'generated');
	if (await Bun.file(path.join(generatedDir, 'registry.ts')).exists()) {
		return generatedDir;
	}
	return projectDir;
}

/**
 * Detect existing ORM setup in project.
 * TODO: This is probably not 100% accurate. Drizzle config could be in all sorts of places in a repo.
 */
export async function detectOrmSetup(projectDir: string): Promise<OrmSetup> {
	const drizzleConfigTs = path.join(projectDir, 'drizzle.config.ts');
	const drizzleConfigJs = path.join(projectDir, 'drizzle.config.js');
	const prismaSchema = path.join(projectDir, 'prisma', 'schema.prisma');

	if ((await Bun.file(drizzleConfigTs).exists()) || (await Bun.file(drizzleConfigJs).exists())) {
		return 'drizzle';
	}

	if (await Bun.file(prismaSchema).exists()) {
		return 'prisma';
	}

	return 'none';
}

/**
 * Generate auth schema SQL using drizzle-kit export.
 *
 * This generates SQL DDL statements from the @agentuity/auth Drizzle schema
 * without needing a database connection.
 *
 * @param projectDir - Project directory (must have @agentuity/auth installed)
 * @returns SQL DDL statements for auth tables
 */
export async function generateAuthSchemaSql(projectDir: string): Promise<string> {
	const schemaPath = path.join(projectDir, 'node_modules/@agentuity/auth/src/schema.ts');

	if (!(await Bun.file(schemaPath).exists())) {
		throw new Error(
			`@agentuity/auth schema not found at ${schemaPath}. Ensure @agentuity/auth is installed.`
		);
	}

	const proc = Bun.spawn(
		['bunx', 'drizzle-kit', 'export', '--dialect=postgresql', `--schema=${schemaPath}`],
		{
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe',
		}
	);

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	if (exitCode !== 0) {
		const errorMsg = stderr
			.split('\n')
			.filter((line) => !line.includes('Please install'))
			.join('\n')
			.trim();
		throw new Error(`drizzle-kit export failed with code ${exitCode}: ${errorMsg}`);
	}

	return makeIdempotent(stdout);
}

/**
 * Transform drizzle-kit SQL output to be idempotent.
 *
 * - Converts CREATE TABLE to CREATE TABLE IF NOT EXISTS
 * - Converts CREATE INDEX to CREATE INDEX IF NOT EXISTS
 * - Wraps ALTER TABLE ADD CONSTRAINT in DO blocks to handle existing constraints
 */
function makeIdempotent(sql: string): string {
	const lines = sql.split('\n');
	const result: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.startsWith('CREATE TABLE ') && !trimmed.includes('IF NOT EXISTS')) {
			result.push(line.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
		} else if (trimmed.startsWith('CREATE INDEX ') && !trimmed.includes('IF NOT EXISTS')) {
			result.push(line.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '));
		} else if (trimmed.startsWith('ALTER TABLE ') && trimmed.includes('ADD CONSTRAINT')) {
			const constraintMatch = trimmed.match(/ADD CONSTRAINT "([^"]+)"/);
			if (constraintMatch) {
				result.push(
					`DO $$ BEGIN ${trimmed} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
				);
			} else {
				result.push(line);
			}
		} else {
			result.push(line);
		}
	}

	return result.join('\n');
}

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
 * Run auth migrations against a database.
 *
 * @param options.sql - SQL to execute (from generateAuthSchemaSql or custom)
 */
export async function runAuthMigrations(options: {
	logger: Logger;
	auth: AuthData;
	orgId: string;
	region: string;
	databaseName: string;
	sql: string;
}): Promise<void> {
	const { logger, auth, orgId, region, databaseName, sql } = options;
	const catalystClient = getCatalystAPIClient(logger, auth, region);

	const statements = splitSqlStatements(sql);

	await tui.spinner({
		message: `Creating auth tables in database "${databaseName}" (${statements.length} SQL statements)`,
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
	return `/**
 * Agentuity Auth configuration.
 *
 * This is the single source of truth for authentication in this project.
 * All auth tables are stored in your Postgres database.
 */

import {
	createAuth,
	createSessionMiddleware,
	createApiKeyMiddleware,
} from '@agentuity/auth';

/**
 * Database URL for authentication.
 *
 * Set via DATABASE_URL environment variable.
 * Get yours from: \`agentuity cloud database list --region use --json\`
 */
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is required for authentication');
}

/**
 * Agentuity Auth instance with sensible defaults.
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
 * Session middleware - validates cookies/bearer tokens.
 * Use for routes that require authentication.
 */
export const authMiddleware = createSessionMiddleware(auth);

/**
 * Optional auth middleware - allows anonymous access.
 * Sets ctx.auth = null for unauthenticated requests.
 */
export const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });

/**
 * API key middleware for programmatic access.
 * Use for webhook endpoints or external integrations.
 */
export const apiKeyMiddleware = createApiKeyMiddleware(auth);

/**
 * Optional API key middleware - continues without auth if no API key present.
 */
export const optionalApiKeyMiddleware = createApiKeyMiddleware(auth, { optional: true });

/**
 * Type export for end-to-end type safety.
 */
export type Auth = typeof auth;
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
	console.log(tui.bold(' 1. Set up your API routes (e.g., src/api/index.ts):'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { createRouter } from '@agentuity/runtime';
import { mountAuthRoutes } from '@agentuity/auth';
import { auth, authMiddleware } from '../auth';

const api = createRouter();

// Mount auth routes (sign-in, sign-up, sign-out, session, etc.)
// Must match the basePath configured in createAuth (default: /api/auth)
api.on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth));

// Protect your API routes with auth middleware
api.use('/api/*', authMiddleware);

api.get('/api/me', async (c) => {
  const user = await c.var.auth.getUser();
  return c.json({ id: user.id, email: user.email });
});

export default api;
`);

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 2. Wrap your React app with AuthProvider:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { AgentuityProvider } from '@agentuity/react';
import { createAuthClient } from '@agentuity/auth/react';
import { AuthProvider } from '@agentuity/auth';

const authClient = createAuthClient();

function App() {
  return (
    <AgentuityProvider>
      <AuthProvider authClient={authClient}>
        {/* your app */}
      </AuthProvider>
    </AgentuityProvider>
  );
}
`);

	console.log(tui.muted('━'.repeat(60)));
	console.log(tui.bold(' 3. Access auth in agents via ctx.auth:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { createAgent } from '@agentuity/runtime';

export default createAgent('my-agent', {
  schema: { input: s.object({ name: s.string() }), output: s.string() },
  handler: async (ctx, input) => {
    // ctx.auth is available when using auth middleware
    if (ctx.auth) {
      const user = await ctx.auth.getUser();
      return \`Hello, \${user.email}!\`;
    }
    return 'Hello, anonymous!';
  },
});
`);

	tui.newline();
	console.log(tui.muted('━'.repeat(60)));
	tui.info('Checklist:');
	console.log(`  ${tui.tuiColors.success('✓')} DATABASE_URL configured`);
	console.log(`  ${tui.tuiColors.success('✓')} AGENTUITY_AUTH_SECRET configured`);
	console.log(`  ${tui.tuiColors.success('✓')} Auth tables migrated`);
	console.log(`  ${tui.tuiColors.success('✓')} Dependencies installed`);
	console.log(`  ${tui.muted('○')} Wire Hono middleware`);
	console.log(`  ${tui.muted('○')} Add auth routes (mountAuthRoutes at /api/auth/*)`);
	console.log(`  ${tui.muted('○')} Wrap app with AuthProvider`);
	tui.newline();
}
