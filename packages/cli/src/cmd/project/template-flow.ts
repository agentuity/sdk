import { basename, resolve } from 'node:path';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { cwd } from 'node:process';
import { homedir } from 'node:os';
import {
	projectCreate,
	projectExists,
	listResources,
	projectEnvUpdate,
	getServiceUrls,
	APIClient as ServerAPIClient,
	createResources,
} from '@agentuity/server';
import type { Logger } from '@agentuity/core';
import * as tui from '../../tui';
import { createPrompt, note } from '../../tui';
import { playSound } from '../../sound';
import { fetchTemplates, type TemplateInfo } from './templates';
import { downloadTemplate, setupProject, initGitRepo } from './download';
import { type AuthData, type Config } from '../../types';
import { ErrorCode } from '../../errors';
import type { APIClient } from '../../api';
import { createProjectConfig } from '../../config';
import {
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
	addResourceEnvVars,
	type EnvVars,
} from '../../env-util';
import { promptForDNS } from '../../domain';
import {
	ensureAuthDependencies,
	runAuthMigrations,
	generateAuthFileContent,
	printIntegrationExamples,
	generateAuthSchemaSql,
} from './auth/shared';

interface CreateFlowOptions {
	projectName?: string;
	dir?: string;
	domains?: string[];
	template?: string;
	templateDir?: string;
	templateBranch?: string;
	noInstall: boolean;
	noBuild: boolean;
	skipPrompts: boolean;
	logger: Logger;
	auth?: AuthData;
	config?: Config;
	orgId?: string;
	region?: string;
	apiClient?: APIClient;
}

export async function runCreateFlow(options: CreateFlowOptions): Promise<void> {
	const {
		projectName: initialProjectName,
		dir: targetDir,
		template: initialTemplate,
		templateDir,
		templateBranch,
		skipPrompts,
		logger,
		auth,
		config,
		orgId: selectedOrgId,
		region,
		apiClient,
		domains,
	} = options;

	// Fetch available templates
	if (templateDir) {
		tui.info(`📋 Loading templates from local directory: ${templateDir}...\n`);
	}

	const templates = await tui.spinner({
		message: 'Fetching templates',
		clearOnSuccess: true,
		callback: async () => {
			return fetchTemplates(logger, templateDir, templateBranch);
		},
	});

	if (templates.length === 0) {
		logger.fatal('No templates available', ErrorCode.RESOURCE_NOT_FOUND);
	}

	// Get project name
	let projectName = initialProjectName;

	// Organization is now automatically selected by the CLI framework via optional: { org: true }
	const orgId = selectedOrgId;
	let catalystClient: ServerAPIClient | undefined;

	if (auth) {
		const serviceUrls = getServiceUrls(region!);
		const catalystUrl = config?.overrides?.catalyst_url ?? serviceUrls.catalyst;
		catalystClient = new ServerAPIClient(catalystUrl, logger, auth.apiKey);
	}

	// Create prompt flow
	const prompt = createPrompt();

	if (!skipPrompts) {
		prompt.intro('Create Agentuity Project');
	}

	if (!projectName && !skipPrompts) {
		projectName = await prompt.text({
			message: 'What is the name of your project?',
			hint: 'The name must be unique for your organization',
			initial: '',
			validate: async (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Project name is required';
				}
				if (apiClient && auth && orgId) {
					const exists = await projectExists(apiClient, {
						name: value,
						organization_id: orgId,
					});
					if (exists) {
						return `Project with name '${value}' already exists in this organization`;
					}
				}
				return true;
			},
		});
	}
	projectName = projectName || 'My First Agent';

	// Generate disk-friendly directory name
	const dirName = projectName === '.' ? '.' : sanitizeDirectoryName(projectName);

	// Determine destination directory
	// Expand ~ to home directory
	let expandedTargetDir = targetDir;
	if (expandedTargetDir?.startsWith('~')) {
		expandedTargetDir = expandedTargetDir.replace(/^~/, homedir());
	}
	const baseDir = expandedTargetDir ? resolve(expandedTargetDir) : process.cwd();
	const dest = dirName === '.' ? baseDir : resolve(baseDir, dirName);
	const destExists = existsSync(dest);
	const destIsDir = destExists ? statSync(dest).isDirectory() : false;
	const destEmpty = destIsDir ? readdirSync(dest).length === 0 : !destExists;

	if (destExists && !destEmpty && dirName !== '.') {
		// In TTY mode, ask if they want to overwrite
		if (process.stdin.isTTY && !skipPrompts) {
			tui.warning(`Directory ${dest} already exists and is not empty.`, true);
			console.log(tui.tuiColors.secondary('│'));
			const overwrite = await prompt.confirm({
				message: 'Delete and overwrite the directory?',
				initial: false,
			});

			if (!overwrite) {
				tui.info('Operation cancelled');
				process.exit(0);
			}

			// Extra safety: refuse to delete root or home directories
			const home = homedir();
			if (dest === '/' || dest === home) {
				logger.fatal(`Refusing to delete protected path: ${dest}`, ErrorCode.VALIDATION_FAILED);
				return;
			}
			rmSync(dest, { recursive: true, force: true });
			tui.success(`Deleted ${dest}`);
			console.log(tui.tuiColors.secondary('│'));
		} else {
			logger.fatal(
				`Directory ${dest} already exists and is not empty.`,
				ErrorCode.RESOURCE_ALREADY_EXISTS
			);
		}
	}

	// Step 5: Select template
	let selectedTemplate: TemplateInfo;
	if (initialTemplate) {
		const found = templates.find((t) => t.id === initialTemplate);
		if (!found) {
			const availableTemplates = templates
				.map((t) => `  - ${t.id.padEnd(20)} ${t.description}`)
				.join('\n');
			logger.fatal(
				`Template "${initialTemplate}" not found\n\nAvailable templates:\n${availableTemplates}`,
				ErrorCode.RESOURCE_NOT_FOUND
			);
			return;
		}
		selectedTemplate = found;
	} else if (skipPrompts || templates.length === 1) {
		selectedTemplate = templates[0];
	} else {
		let maxLength = 15;
		templates.forEach((t) => {
			if (maxLength < t.name.length) {
				maxLength = t.name.length;
			}
		});
		maxLength = Math.min(maxLength + 1, 40);
		const [_winWidth] = process.stdout.getWindowSize();
		const winWidth = _winWidth - maxLength - 8; // space for the name and left indent
		const templateId = await prompt.select({
			message: 'Select a template:',
			options: templates.map((t) => ({
				value: t.id,
				label: t.name.padEnd(maxLength),
				hint:
					t.description.length > winWidth
						? t.description.substring(0, winWidth - 3) + '...'
						: t.description,
			})),
		});
		const found = templates.find((t) => t.id === templateId);
		if (!found) {
			logger.fatal('Template selection failed', ErrorCode.USER_CANCELLED);
			return;
		}
		selectedTemplate = found;
	}

	// Download template
	await downloadTemplate({
		dest,
		template: selectedTemplate,
		templateDir,
		templateBranch,
		logger,
	});

	// Setup project (replace placeholders, install deps, build)
	await setupProject({
		dest,
		projectName: projectName === '.' ? basename(dest) : projectName,
		dirName: dirName === '.' ? basename(dest) : dirName,
		noInstall: options.noInstall,
		noBuild: options.noBuild,
		logger,
	});

	// Re-display template selection after spinners clear it (only if user actually selected)
	if (!skipPrompts && templates.length > 1) {
		const { symbols, tuiColors } = tui;
		console.log(`${tuiColors.completed(symbols.completed)}  Select a template:`);
		console.log(`${tuiColors.secondary(symbols.bar)}  ${tuiColors.muted(selectedTemplate.name)}`);
		// Only add bar if we're going to show resource prompts
		if (auth && apiClient && catalystClient && orgId && region) {
			console.log(tuiColors.secondary(symbols.bar));
		}
	}

	let _domains = domains;
	const resourceEnvVars: EnvVars = {};

	if (auth && apiClient && catalystClient && orgId && region && !skipPrompts) {
		// Fetch resources for selected org and region using Catalyst API
		const resources = await tui.spinner({
			message: 'Fetching resources',
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		logger.debug(`Resources for org ${orgId} in region ${region}:`, resources);

		const db_action = await prompt.select({
			message: 'Create SQL Database?',
			options: [
				{ value: 'Skip', label: 'Skip or Setup later' },
				{ value: 'Create New', label: 'Create a new database' },
				...resources.db.map((db) => ({
					value: db.name,
					label: `Use database: ${tui.tuiColors.primary(db.name)}`,
				})),
			],
		});

		const s3_action = await prompt.select({
			message: 'Create Storage Bucket?',
			options: [
				{ value: 'Skip', label: 'Skip or Setup later' },
				{ value: 'Create New', label: 'Create a new bucket' },
				...resources.s3.map((bucket) => ({
					value: bucket.bucket_name,
					label: `Use bucket: ${tui.tuiColors.primary(bucket.bucket_name)}`,
				})),
			],
		});

		if (!domains?.length) {
			const customDns = await prompt.text({
				message: 'Setup custom DNS?',
				hint: 'Enter a domain name or press Enter to skip',
				validate: (val: string) =>
					val === ''
						? true
						: /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,63}$/.test(
								val
							),
			});
			if (customDns) {
				_domains = [customDns];
			}
		}

		const choices = { db_action, s3_action };
		switch (choices.s3_action) {
			case 'Create New': {
				const created = await tui.spinner({
					message: 'Provisioning New Bucket',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient, orgId, region!, [{ type: 's3' }]);
					},
				});
				// Collect env vars from newly created resource
				if (created[0]?.env) {
					Object.assign(resourceEnvVars, created[0].env);
				}
				break;
			}
			case 'Skip': {
				break;
			}
			default: {
				// User selected an existing bucket - get env vars from the resources list
				const selectedBucket = resources.s3.find((b) => b.bucket_name === choices.s3_action);
				if (selectedBucket?.env) {
					Object.assign(resourceEnvVars, selectedBucket.env);
				}
				break;
			}
		}
		switch (choices.db_action) {
			case 'Create New': {
				const created = await tui.spinner({
					message: 'Provisioning New SQL Database',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient, orgId, region!, [{ type: 'db' }]);
					},
				});
				// Collect env vars from newly created resource
				if (created[0]?.env) {
					Object.assign(resourceEnvVars, created[0].env);
				}
				break;
			}
			case 'Skip': {
				break;
			}
			default: {
				// User selected an existing database - get env vars from the resources list
				const selectedDb = resources.db.find((d) => d.name === choices.db_action);
				if (selectedDb?.env) {
					Object.assign(resourceEnvVars, selectedDb.env);
				}
				break;
			}
		}
	}

	// Auth setup - either from template or user choice
	const templateHasAuth = selectedTemplate.id === 'agentuity-auth';

	let authEnabled = templateHasAuth; // Auth templates have auth enabled by default
	let authDatabaseName: string | undefined;
	let authDatabaseUrl: string | undefined;

	// For non-auth templates, ask if they want to enable auth
	if (auth && catalystClient && orgId && region && !skipPrompts && !templateHasAuth) {
		const enableAuth = await prompt.select({
			message: 'Enable Agentuity Authentication?',
			options: [
				{ value: 'no', label: "No, I'll add auth later" },
				{ value: 'yes', label: 'Yes, set up Agentuity Auth' },
			],
		});

		if (enableAuth === 'yes') {
			authEnabled = true;
		}
	}

	// Set up database and secret for any auth-enabled project
	if (authEnabled && auth && catalystClient && orgId && region && !skipPrompts) {
		// If a database was already selected/created above, use it for auth
		if (resourceEnvVars.DATABASE_URL) {
			authDatabaseUrl = resourceEnvVars.DATABASE_URL;
			// Extract database name from URL using proper URL parsing
			try {
				const dbUrl = new URL(authDatabaseUrl);
				const dbName = dbUrl.pathname.replace(/^\/+/, ''); // Remove leading slashes
				// Validate: non-empty and contains only safe characters
				if (dbName && /^[A-Za-z0-9_-]+$/.test(dbName)) {
					authDatabaseName = dbName;
				}
			} catch {
				// Invalid URL format, authDatabaseName stays undefined
			}
		} else {
			// No database selected yet, create one for auth
			const created = await tui.spinner({
				message: 'Provisioning database for auth',
				clearOnSuccess: true,
				callback: async () => {
					return createResources(catalystClient, orgId, region!, [{ type: 'db' }]);
				},
			});
			authDatabaseName = created[0].name;

			// Get env vars from created resource
			if (created[0]?.env) {
				authDatabaseUrl = created[0].env.DATABASE_URL;
				// Also add to resourceEnvVars if not already set
				if (!resourceEnvVars.DATABASE_URL) {
					Object.assign(resourceEnvVars, created[0].env);
				}
			}
		}

		// Install auth dependencies (skip for agentuity-auth template which has them)
		if (!templateHasAuth) {
			await ensureAuthDependencies({ projectDir: dest, logger });

			// Generate auth.ts
			const authFilePath = resolve(dest, 'src', 'auth.ts');
			if (!existsSync(authFilePath)) {
				const srcDir = resolve(dest, 'src');
				if (!existsSync(srcDir)) {
					await Bun.write(resolve(srcDir, '.gitkeep'), '');
				}
				await Bun.write(authFilePath, generateAuthFileContent());
				tui.success('Created src/auth.ts');
			}
		}

		// Run migrations
		if (authDatabaseName) {
			const sql = await tui.spinner({
				message: 'Preparing auth database schema...',
				clearOnSuccess: true,
				callback: () => generateAuthSchemaSql(logger, dest),
			});

			await runAuthMigrations({
				logger,
				auth,
				orgId,
				region,
				databaseName: authDatabaseName,
				sql,
			});
		}
	}

	let projectId: string | undefined;

	if (auth && apiClient && orgId) {
		const cloudRegion = region ?? process.env.AGENTUITY_REGION ?? 'usc';

		const pkgJsonPath = resolve(dest, 'package.json');
		let pkgJson: { description?: string; keywords?: string[] } = {};
		if (existsSync(pkgJsonPath)) {
			pkgJson = await Bun.file(pkgJsonPath).json();
		}

		const keywords = Array.isArray(pkgJson.keywords) ? pkgJson.keywords : [];
		const tags = keywords.filter(
			(tag) => tag.toLowerCase() !== 'agentuity' && !tag.toLowerCase().startsWith('agentuity')
		);

		await tui.spinner({
			message: 'Registering your project',
			clearOnSuccess: true,
			callback: async () => {
				const project = await projectCreate(apiClient, {
					name: projectName,
					description: pkgJson.description,
					tags: tags.length > 0 ? tags : undefined,
					orgId,
					cloudRegion,
					domains: _domains,
				});
				projectId = project.id;
				return createProjectConfig(dest, {
					projectId: project.id,
					orgId,
					sdkKey: project.sdkKey,
					deployment: {
						domains: _domains,
					},
					region: cloudRegion,
				});
			},
		});

		// Add auth secret to resourceEnvVars if auth is enabled
		if (authEnabled && !resourceEnvVars.AGENTUITY_AUTH_SECRET) {
			const devSecret = `dev-${crypto.randomUUID()}`;
			resourceEnvVars.AGENTUITY_AUTH_SECRET = devSecret;
		}

		// Write resource environment variables to .env
		if (Object.keys(resourceEnvVars).length > 0) {
			await addResourceEnvVars(dest, resourceEnvVars);

			// Show user feedback for auth-related env vars
			if (authEnabled) {
				if (resourceEnvVars.DATABASE_URL) {
					tui.success('DATABASE_URL added to .env');
				}
				if (resourceEnvVars.AGENTUITY_AUTH_SECRET) {
					tui.success('AGENTUITY_AUTH_SECRET added to .env');
					tui.info(
						`Generate one with: ${tui.muted('npx @better-auth/cli secret')} or ${tui.muted('openssl rand -hex 32')}`
					);
				}
			}
		}

		// After registration, push any existing env/secrets from .env
		if (projectId) {
			await tui.spinner({
				message: 'Syncing environment variables',
				clearOnSuccess: true,
				callback: async () => {
					try {
						const envFilePath = await findExistingEnvFile(dest);
						const localEnv = await readEnvFile(envFilePath);
						const filteredEnv = filterAgentuitySdkKeys(localEnv);

						if (Object.keys(filteredEnv).length > 0) {
							const { env, secrets } = splitEnvAndSecrets(filteredEnv);
							await projectEnvUpdate(apiClient, {
								id: projectId as string,
								env,
								secrets,
							});
							logger.debug(
								`Synced ${Object.keys(filteredEnv).length} environment variables to cloud`
							);
						}
					} catch (error) {
						// Non-fatal: just log the error
						logger.debug('Failed to sync environment variables:', error);
					}
				},
			});
		}
	}

	// Initialize git repository after all files are generated
	await initGitRepo(dest);

	// Show completion message
	if (!skipPrompts) {
		tui.success('✨ Project created successfully!\n');

		// Show next steps in a box with primary color for commands
		if (dirName !== '.') {
			// Use relative path if dest is under cwd, otherwise show full path
			const currentDir = cwd();
			const dirDisplay = dest.startsWith(currentDir) ? basename(dest) : dest;
			note(
				`${tui.tuiColors.primary(`cd ${dirDisplay}`)}\n${tui.tuiColors.primary('bun run dev')}`,
				'Next steps'
			);
		} else {
			note(tui.tuiColors.primary('bun run dev'), 'Next steps');
		}

		prompt.outro(
			`${tui.tuiColors.muted('🛟 Need help?')} ${tui.link('https://discord.gg/agentuity')}`,
			`${tui.tuiColors.muted('⭐️ Follow us:')} ${tui.link('https://github.com/agentuity/sdk')}`
		);
	} else {
		tui.success('✨ Project created successfully!');
	}

	playSound();

	if (process.stdin.isTTY && !skipPrompts && _domains?.length && projectId) {
		tui.newline();
		const ok = await tui.confirm('Would you like to configure DNS now?', true);
		if (ok) {
			tui.newline();
			await promptForDNS(projectId, _domains, config);
		}
	}

	// Print auth integration examples if auth was enabled (skip for auth template - already set up)
	if (authEnabled && !templateHasAuth) {
		printIntegrationExamples();
	}
}

/**
 * Sanitize a project name to create a safe directory/package name
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes unsafe characters
 * - Ensures it starts with a letter or number
 */
function sanitizeDirectoryName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/_+/g, '-') // Replace underscores with hyphens
		.replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except hyphens
		.replace(/-+/g, '-') // Collapse multiple hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
		.replace(/^[^a-z0-9]+/, ''); // Remove leading non-alphanumeric
}
