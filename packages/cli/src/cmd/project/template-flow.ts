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
	validateDatabaseName,
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
	database?: string;
	storage?: string;
	enableAuth?: boolean;
}

export interface CreateFlowResult {
	projectId?: string;
	orgId?: string;
	name: string;
	path: string;
	template: string;
	installed: boolean;
	built: boolean;
	domains?: string[];
	success: boolean;
	error?: string;
}

export async function runCreateFlow(options: CreateFlowOptions): Promise<CreateFlowResult> {
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
		database: databaseOption,
		storage: storageOption,
		enableAuth: enableAuthOption,
	} = options;

	const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
	const isInteractive = !skipPrompts && !isHeadless;

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

	if (isInteractive) {
		prompt.intro('Create Agentuity Project');
	}

	if (!projectName && isInteractive) {
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
		// In interactive mode, ask if they want to overwrite
		if (isInteractive) {
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
				return undefined as never;
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
			return undefined as never;
		}
		selectedTemplate = found;
	} else if (!isInteractive || templates.length === 1) {
		const firstTemplate = templates[0];
		if (!firstTemplate) {
			logger.fatal('No templates available', ErrorCode.RESOURCE_NOT_FOUND);
			return undefined as never;
		}
		selectedTemplate = firstTemplate;
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
			return undefined as never;
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
	const setupResult = await setupProject({
		dest,
		projectName: projectName === '.' ? basename(dest) : projectName,
		dirName: dirName === '.' ? basename(dest) : dirName,
		noInstall: options.noInstall,
		noBuild: options.noBuild,
		logger,
	});

	// If setup failed, skip resource prompts and registration - just show error and return
	if (!setupResult.success) {
		tui.warning('Project setup failed. Skipping resource configuration.');
		return {
			name: projectName,
			path: dest,
			template: selectedTemplate.id,
			installed: !options.noInstall,
			built: false,
			success: false,
			error: 'Project setup completed with errors',
		};
	}

	// Add separator bar if we're going to show resource prompts
	const canProvision = auth && apiClient && catalystClient && orgId && region;
	// Only count as resource flags if actually requesting provisioning (not explicit skip)
	const hasResourceFlags =
		(databaseOption !== undefined && databaseOption.toLowerCase() !== 'skip') ||
		(storageOption !== undefined && storageOption.toLowerCase() !== 'skip');

	if (isInteractive && canProvision) {
		const { symbols, tuiColors } = tui;
		console.log(tuiColors.secondary(symbols.bar));
	}

	let _domains = domains;
	const resourceEnvVars: EnvVars = {};

	// Validate that resource flags require authentication and registration
	if (hasResourceFlags && !canProvision) {
		logger.fatal(
			'Cannot provision database/storage without being authenticated and registering the project.\n' +
				'Remove --no-register or omit --database/--storage flags.',
			ErrorCode.VALIDATION_FAILED
		);
	}

	// Validate that --enable-auth requires authentication and registration
	if (enableAuthOption && !canProvision) {
		logger.fatal(
			'Cannot enable Agentuity Auth without being authenticated and registering the project.\n' +
				'Remove --no-register or omit --enable-auth flag.',
			ErrorCode.VALIDATION_FAILED
		);
	}

	if (canProvision) {
		// Fetch resources for selected org and region using Catalyst API (needed for both interactive and CLI flags)
		let resources: Awaited<ReturnType<typeof listResources>> | undefined;

		const needResources =
			isInteractive ||
			(databaseOption && databaseOption !== 'skip' && databaseOption !== 'new') ||
			(storageOption && storageOption !== 'skip' && storageOption !== 'new');

		if (needResources) {
			resources = await tui.spinner({
				message: 'Fetching resources',
				clearOnSuccess: true,
				callback: async () => {
					return listResources(catalystClient!, orgId!, region!);
				},
			});
			// Log sanitized summary (avoid exposing DATABASE_URL, tokens, secrets)
			logger.debug(
				`Resources for org ${orgId} in region ${region}: ${resources.db.length} databases, ${resources.s3.length} storage buckets`
			);
			logger.debug(`Database names: ${resources.db.map((d) => d.name).join(', ') || '(none)'}`);
			logger.debug(
				`Storage buckets: ${resources.s3.map((b) => b.bucket_name).join(', ') || '(none)'}`
			);
		}

		// Determine database action: CLI flag > interactive prompt > skip (headless)
		let db_action: string;
		if (databaseOption !== undefined) {
			// CLI flag provided - normalize to expected values
			if (databaseOption.toLowerCase() === 'new') {
				db_action = 'Create New';
			} else if (databaseOption.toLowerCase() === 'skip') {
				db_action = 'Skip';
			} else {
				// Existing database name - validate it exists
				const existingDb = resources?.db.find((d) => d.name === databaseOption);
				if (!existingDb) {
					logger.fatal(
						`Database '${databaseOption}' not found. Use 'new' to create a new database or 'skip' to skip.`,
						ErrorCode.RESOURCE_NOT_FOUND
					);
				}
				db_action = databaseOption;
			}
		} else if (isInteractive) {
			db_action = await prompt.select({
				message: 'Create SQL Database?',
				options: [
					{ value: 'Skip', label: 'Skip or Setup later' },
					{ value: 'Create New', label: 'Create a new database' },
					...resources!.db.map((db) => ({
						value: db.name,
						label: `Use database: ${tui.tuiColors.primary(db.name)}`,
					})),
				],
			});
		} else {
			// Headless without flag - skip
			db_action = 'Skip';
		}

		// Determine storage action: CLI flag > interactive prompt > skip (headless)
		let s3_action: string;
		if (storageOption !== undefined) {
			// CLI flag provided - normalize to expected values
			if (storageOption.toLowerCase() === 'new') {
				s3_action = 'Create New';
			} else if (storageOption.toLowerCase() === 'skip') {
				s3_action = 'Skip';
			} else {
				// Existing bucket name - validate it exists
				const existingBucket = resources?.s3.find((b) => b.bucket_name === storageOption);
				if (!existingBucket) {
					logger.fatal(
						`Storage bucket '${storageOption}' not found. Use 'new' to create a new bucket or 'skip' to skip.`,
						ErrorCode.RESOURCE_NOT_FOUND
					);
				}
				s3_action = storageOption;
			}
		} else if (isInteractive) {
			s3_action = await prompt.select({
				message: 'Create Storage Bucket?',
				options: [
					{ value: 'Skip', label: 'Skip or Setup later' },
					{ value: 'Create New', label: 'Create a new bucket' },
					...resources!.s3.map((bucket) => ({
						value: bucket.bucket_name,
						label: `Use bucket: ${tui.tuiColors.primary(bucket.bucket_name)}`,
					})),
				],
			});
		} else {
			// Headless without flag - skip
			s3_action = 'Skip';
		}

		// Custom DNS: only prompt in interactive mode if not already provided
		if (!domains?.length && isInteractive) {
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

		// Process storage action
		switch (s3_action) {
			case 'Create New': {
				const created = await tui.spinner({
					message: 'Provisioning New Bucket',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient!, orgId!, region!, [{ type: 's3' }]);
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
				const selectedBucket = resources?.s3.find((b) => b.bucket_name === s3_action);
				if (selectedBucket?.env) {
					Object.assign(resourceEnvVars, selectedBucket.env);
				}
				break;
			}
		}

		// Process database action
		switch (db_action) {
			case 'Create New': {
				let dbName: string | undefined;
				let dbDescription: string | undefined;

				// Only prompt for name/description in interactive mode
				if (isInteractive) {
					const dbNameInput = await prompt.text({
						message: 'Database name',
						hint: 'Optional - lowercase letters, digits, underscores only',
						validate: (value: string) => {
							const trimmed = value.trim();
							if (trimmed === '') return true;
							const result = validateDatabaseName(trimmed);
							return result.valid ? true : result.error!;
						},
					});
					dbName = dbNameInput.trim() || undefined;
					dbDescription =
						(await prompt.text({
							message: 'Database description',
							hint: 'Optional - press Enter to skip',
						})) || undefined;
				}

				const created = await tui.spinner({
					message: 'Provisioning New SQL Database',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient!, orgId!, region!, [
							{
								type: 'db',
								name: dbName,
								description: dbDescription,
							},
						]);
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
				const selectedDb = resources?.db.find((d) => d.name === db_action);
				if (selectedDb?.env) {
					Object.assign(resourceEnvVars, selectedDb.env);
				}
				break;
			}
		}
	}

	// Auth setup - either from template, CLI flag, or user choice
	const templateHasAuth = selectedTemplate.id === 'agentuity-auth';

	let authEnabled = templateHasAuth; // Auth templates have auth enabled by default
	let authDatabaseName: string | undefined;
	let authDatabaseUrl: string | undefined;

	// Handle auth enablement: CLI flag > interactive prompt > disabled (headless)
	if (enableAuthOption !== undefined) {
		// CLI flag provided
		authEnabled = enableAuthOption;
	} else if (canProvision && isInteractive && !templateHasAuth) {
		// For non-auth templates in interactive mode, ask if they want to enable auth
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
	// In headless mode without --enable-auth flag, authEnabled stays false (unless template has auth)

	// Set up database and secret for any auth-enabled project
	if (authEnabled && canProvision) {
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
					return createResources(catalystClient!, orgId!, region!, [{ type: 'db' }]);
				},
			});
			const createdDb = created[0];
			if (!createdDb) {
				logger.fatal('Failed to create database for auth', ErrorCode.RESOURCE_NOT_FOUND);
				return undefined as never;
			}
			authDatabaseName = createdDb.name;

			// Get env vars from created resource
			if (createdDb.env) {
				authDatabaseUrl = createdDb.env.DATABASE_URL;
				// Also add to resourceEnvVars if not already set
				if (!resourceEnvVars.DATABASE_URL) {
					Object.assign(resourceEnvVars, createdDb.env);
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

		// Add base URL for local development if auth is enabled
		if (authEnabled && !resourceEnvVars.AGENTUITY_BASE_URL) {
			resourceEnvVars.AGENTUITY_BASE_URL = 'http://localhost:3500';
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
				if (resourceEnvVars.AGENTUITY_BASE_URL) {
					tui.success('AGENTUITY_BASE_URL added to .env');
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
	if (isInteractive) {
		if (setupResult.success) {
			tui.success('✨ Project created successfully!\n');
		} else {
			tui.warning('Project created with errors (see above)\n');
		}

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
		if (setupResult.success) {
			tui.success('✨ Project created successfully!');
		} else {
			tui.warning('Project created with errors');
		}
	}

	playSound();

	if (isInteractive && _domains?.length && projectId) {
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

	return {
		projectId,
		orgId,
		name: projectName,
		path: dest,
		template: selectedTemplate.id,
		installed: !options.noInstall,
		built: !options.noBuild && setupResult.success,
		domains: _domains,
		success: setupResult.success,
		error: setupResult.success ? undefined : 'Project setup completed with errors',
	};
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
