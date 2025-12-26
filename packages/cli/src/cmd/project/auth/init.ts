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
} from './shared';
import enquirer from 'enquirer';
import * as fs from 'fs';
import * as path from 'path';

export const initSubcommand = createSubcommand({
	name: 'init',
	description: 'Set up Agentuity Auth for your project',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
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
				.describe('Skip running database migrations (run ensureAuthSchema at runtime instead)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether setup succeeded'),
			database: z.string().optional().describe('Database name used'),
			authFileCreated: z.boolean().describe('Whether auth.ts was created'),
			migrationsRun: z.boolean().describe('Whether migrations were run'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, auth, orgId, region } = ctx;

		tui.newline();
		tui.info(tui.bold('Agentuity Auth Setup'));
		tui.newline();
		tui.info('This will:');
		console.log('  • Ensure you have a Postgres database configured');
		console.log('  • Install @agentuity/auth and better-auth');
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
				if (match) {
					databaseUrl = match[1].trim().replace(/^["']|["']$/g, '');
				}
			}
		}

		// Show database picker (with existing as first option if configured)
		const dbInfo = await selectOrCreateDatabase({
			logger,
			auth,
			orgId,
			region,
			existingUrl: databaseUrl,
		});

		const databaseName = dbInfo.name;

		// Update .env if database changed
		if (dbInfo.url !== databaseUrl) {
			const envPath = path.join(projectDir, '.env');
			let envContent = '';

			if (fs.existsSync(envPath)) {
				envContent = fs.readFileSync(envPath, 'utf-8');
				// Remove existing DATABASE_URL if present
				envContent = envContent.replace(/^DATABASE_URL=.*\n?/m, '');
				if (!envContent.endsWith('\n') && envContent.length > 0) {
					envContent += '\n';
				}
			}

			envContent += `DATABASE_URL="${dbInfo.url}"\n`;
			fs.writeFileSync(envPath, envContent);
			tui.success('DATABASE_URL updated in .env');
		} else {
			tui.success(`Using database: ${databaseName}`);
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

		// Step 4: Run migrations
		let migrationsRun = false;

		if (opts.skipMigrations) {
			tui.info('Skipping migrations (use ensureAuthSchema() at runtime)');
		} else if (databaseName) {
			tui.newline();
			const { runMigrations } = await enquirer.prompt<{ runMigrations: boolean }>({
				type: 'confirm',
				name: 'runMigrations',
				message: 'Run database migrations now? (idempotent, safe to re-run)',
				initial: true,
			});

			if (runMigrations) {
				await runAuthMigrations({
					logger,
					auth,
					orgId,
					region,
					databaseName,
				});
				migrationsRun = true;
			}
		} else {
			tui.warning(
				'Could not determine database name. Run migrations manually or call ensureAuthSchema() at runtime.'
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
