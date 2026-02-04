import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import {
	selectOrCreateDatabase,
	ensureAuthDependencies,
	runAuthMigrations,
	generateAuthFileContent,
	printIntegrationExamples,
	detectOrmSetup,
	generateAuthSchemaSql,
	getGeneratedSqlDir,
} from './shared';
import { readEnvFile, writeEnvFile } from '../../../env-util';
import enquirer from 'enquirer';
import * as fs from 'fs';
import * as path from 'path';

export const initSubcommand = createSubcommand({
	name: 'init',
	description: 'Set up Agentuity Auth for your project',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true, org: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('project auth init'),
			description: 'Set up Agentuity Auth with database selection',
		},
	],
	schema: {
		options: z.object({
			skipMigrations: z
				.boolean()
				.optional()
				.describe(
					'Skip running database migrations (run `agentuity project auth generate` later)'
				),
		}),
		response: z.object({
			success: z.boolean().describe('Whether setup succeeded'),
			database: z.string().optional().describe('Database name used'),
			authFileCreated: z.boolean().describe('Whether auth.ts was created'),
			migrationsRun: z.boolean().describe('Whether migrations were run'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, auth, orgId, config } = ctx;

		tui.newline();
		tui.info(tui.bold('Agentuity Auth Setup'));
		tui.newline();
		tui.info('This will:');
		console.log('  • Ensure you have a Postgres database configured');
		console.log('  • Install @agentuity/auth');
		console.log('  • Run database migrations to create auth tables');
		console.log('  • Show you how to wire auth into your API and UI');
		tui.newline();

		const projectDir = process.cwd();

		// Check for package.json
		const packageJsonPath = path.join(projectDir, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			tui.fatal('No package.json found. Run this command from your project root.');
		}

		// Step 1: Check for DATABASE_URL or select/create database
		let databaseUrl = process.env.DATABASE_URL;

		if (!databaseUrl) {
			// Check .env file
			const envPath = path.join(projectDir, '.env');
		if (fs.existsSync(envPath)) {
			const envContent = fs.readFileSync(envPath, 'utf-8');
			const match = envContent.match(/^DATABASE_URL=(.+)$/m);
			if (match?.[1]) {
				databaseUrl = match[1].trim().replace(/^["']|["']$/g, '');
			}
		}
		}

		// Show database picker (with existing as first option if configured)
		const dbInfo = await selectOrCreateDatabase({
			logger,
			auth,
			orgId,
			config,
			existingUrl: databaseUrl,
			projectDir,
		});

		// Get the region from the selected database
		const region = dbInfo.region;

		const databaseName = dbInfo.name;

		// Update .env with database URL using proper parsing
		const envPath = path.join(projectDir, '.env');
		const existingEnv = await readEnvFile(envPath);

		// Check if DATABASE_URL already exists
		const hasDatabaseUrl = 'DATABASE_URL' in existingEnv;

		if (dbInfo.url !== databaseUrl || !hasDatabaseUrl) {
			if (hasDatabaseUrl) {
				// DATABASE_URL exists, use AUTH_DATABASE_URL instead
				await writeEnvFile(envPath, { AUTH_DATABASE_URL: dbInfo.url });
				tui.success('AUTH_DATABASE_URL added to .env');
				tui.warning(
					`DATABASE_URL already exists. Update your ${tui.bold('src/auth.ts')} to use AUTH_DATABASE_URL.`
				);
			} else {
				await writeEnvFile(envPath, { DATABASE_URL: dbInfo.url });
				tui.success('DATABASE_URL added to .env');
			}
		} else {
			tui.success(`Using database: ${databaseName}`);
		}

		// Add AGENTUITY_AUTH_SECRET if not present
		// Re-read env to get latest state
		const currentEnv = await readEnvFile(envPath);

		const hasAuthSecret =
			'AGENTUITY_AUTH_SECRET' in currentEnv || 'BETTER_AUTH_SECRET' in currentEnv;
		if (!hasAuthSecret) {
			const devSecret = `dev-${crypto.randomUUID()}-CHANGE-ME`;
			await writeEnvFile(envPath, { AGENTUITY_AUTH_SECRET: devSecret });
			tui.success('AGENTUITY_AUTH_SECRET added to .env (development default)');
			tui.warning(
				`Replace ${tui.bold('AGENTUITY_AUTH_SECRET')} with a secure value before deploying.`
			);
			tui.info(`Generate one with: ${tui.muted('openssl rand -hex 32')}`);
		}

		// Step 2: Install dependencies
		tui.newline();
		await ensureAuthDependencies({ projectDir, logger });

		// Step 3: Generate auth.ts if it doesn't exist
		const authFilePath = path.join(projectDir, 'src', 'auth.ts');
		let authFileCreated = false;

		if (fs.existsSync(authFilePath)) {
			tui.info('src/auth.ts already exists, skipping generation');
		} else {
			const { createFile } = await enquirer.prompt<{ createFile: boolean }>({
				type: 'confirm',
				name: 'createFile',
				message: 'Create src/auth.ts with default configuration?',
				initial: true,
			});

			if (createFile) {
				// Ensure src directory exists
				const srcDir = path.join(projectDir, 'src');
				if (!fs.existsSync(srcDir)) {
					fs.mkdirSync(srcDir, { recursive: true });
				}

				fs.writeFileSync(authFilePath, generateAuthFileContent());
				tui.success('Created src/auth.ts');
				authFileCreated = true;
			}
		}

		// Step 4: Run migrations (ORM-aware)
		let migrationsRun = false;

		if (opts.skipMigrations) {
			tui.info('Skipping migrations (run `agentuity project auth generate` later)');
		} else if (databaseName) {
			tui.newline();

			const ormSetup = await detectOrmSetup(projectDir);

			if (ormSetup === 'drizzle') {
				tui.info(tui.bold('Drizzle detected in your project.'));
				tui.newline();
				console.log(
					'  Since you manage your own Drizzle schema, add authSchema to your schema:'
				);
				tui.newline();
				console.log(tui.muted("    import * as authSchema from '@agentuity/auth/schema';"));
				console.log(tui.muted('    export const schema = { ...authSchema, ...yourSchema };'));
				tui.newline();
				console.log('  Then run migrations:');
				console.log(tui.muted('    bunx drizzle-kit push'));
				tui.newline();
			} else if (ormSetup === 'prisma') {
				tui.info(tui.bold('Prisma detected in your project.'));
				tui.newline();

				const sql = await tui.spinner({
					message: 'Preparing auth database schema...',
					clearOnSuccess: true,
					callback: () => generateAuthSchemaSql(logger, projectDir),
				});

				const sqlOutputDir = await getGeneratedSqlDir(projectDir);
				const sqlFileName = 'agentuity-auth-schema.sql';
				const sqlFilePath = path.join(sqlOutputDir, sqlFileName);
				const relativePath =
					sqlOutputDir === projectDir ? sqlFileName : path.relative(projectDir, sqlFilePath);
				fs.writeFileSync(sqlFilePath, sql);
				tui.success(`Auth schema SQL saved to ${tui.bold(relativePath)}`);
				tui.newline();
				console.log('  Run this SQL against your database to create auth tables.');
				tui.newline();
			} else {
				const { runMigrations } = await enquirer.prompt<{ runMigrations: boolean }>({
					type: 'confirm',
					name: 'runMigrations',
					message: 'Run database migrations now? (idempotent, safe to re-run)',
					initial: true,
				});

				if (runMigrations) {
					const sql = await tui.spinner({
						message: 'Preparing auth database schema...',
						clearOnSuccess: true,
						callback: () => generateAuthSchemaSql(logger, projectDir),
					});

					await runAuthMigrations({
						logger,
						auth,
						orgId,
						region,
						databaseName,
						sql,
					});
					migrationsRun = true;
				}
			}
		} else {
			tui.warning(
				'Could not determine database name. Run `agentuity project auth generate` manually.'
			);
		}

		// Step 5: Print integration examples
		printIntegrationExamples();

		return {
			success: true,
			database: databaseName,
			authFileCreated,
			migrationsRun,
		};
	},
});
