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
	'better-auth': '^1.4.9',
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
 * Import the baseline SQL from @agentuity/auth to ensure single source of truth.
 * This SQL is used by both the CLI (for initial setup) and ensureAuthSchema() at runtime.
 *
 * Note: We import directly from the migrations module to avoid pulling in client-side
 * JSX code that would cause TypeScript errors in the CLI build.
 */
import { AGENTUITY_AUTH_BASELINE_SQL } from '@agentuity/auth/agentuity/migrations';
export { AGENTUITY_AUTH_BASELINE_SQL };

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
	createSessionMiddleware,
} from '@agentuity/auth/agentuity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const auth = createAgentuityAuth({
	database: pool,
	basePath: '/api/auth',
	// Secret used by BetterAuth for signing/verifying tokens and cookies.
	// Generate with: openssl rand -hex 32
	secret: process.env.BETTER_AUTH_SECRET!,
});

// Required auth middleware - returns 401 if not authenticated
export const authMiddleware = createSessionMiddleware(auth);

// Optional auth middleware - allows anonymous access, sets null auth
export const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });
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
import { mountBetterAuthRoutes } from '@agentuity/auth/agentuity';
import { auth, authMiddleware } from '../auth';

const api = createRouter();

// Mount BetterAuth routes (sign-in, sign-up, sign-out, session, etc.)
// Must match the basePath configured in createAgentuityAuth (default: /api/auth)
api.on(['GET', 'POST'], '/api/auth/*', mountBetterAuthRoutes(auth));

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
	console.log(tui.bold(' 3. Protect agents with withSession:'));
	console.log(tui.muted('━'.repeat(60)));
	console.log(`
import { createAgent } from '@agentuity/runtime';
import { withSession } from '@agentuity/auth/agentuity';

export default createAgent('my-agent', {
  schema: { input: s.object({ name: s.string() }), output: s.string() },
  handler: withSession(async (ctx, { auth, org }, input) => {
    // ctx = AgentContext, auth = { user, session } | null, org = org context
    if (auth) {
      const email = (auth.user as { email?: string }).email;
      return \`Hello, \${email}!\`;
    }
    return 'Hello, anonymous!';
  }, { optional: true }), // optional: true allows unauthenticated access
});
`);

	tui.newline();
	console.log(tui.muted('━'.repeat(60)));
	tui.info('Checklist:');
	console.log(`  ${tui.tuiColors.success('✓')} DATABASE_URL configured`);
	console.log(`  ${tui.muted('○')} BETTER_AUTH_SECRET configured (openssl rand -hex 32)`);
	console.log(`  ${tui.tuiColors.success('✓')} Auth tables migrated`);
	console.log(`  ${tui.tuiColors.success('✓')} Dependencies installed`);
	console.log(`  ${tui.muted('○')} Wire Hono middleware`);
	console.log(`  ${tui.muted('○')} Add auth routes (mountBetterAuthRoutes at /api/auth/*)`);
	console.log(`  ${tui.muted('○')} Wrap app with AgentuityBetterAuth`);
	tui.newline();
}
