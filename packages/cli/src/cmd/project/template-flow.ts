/**
 * Project creation flow — framework-first scaffolding.
 *
 * Instead of custom Agentuity templates, the user picks a framework
 * and we run its official create CLI, then augment with Agentuity integration.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { cwd } from 'node:process';
import type { Logger } from '@agentuity/core';
import {
	createResources,
	getServiceUrls,
	listResources,
	projectCreate,
	projectEnvUpdate,
	projectExists,
	APIClient as ServerAPIClient,
	validateBucketName,
	validateDatabaseName,
} from '@agentuity/server';
import type { APIClient } from '../../api';
import { createProjectConfig } from '../../config';
import { promptForDNS } from '../../domain';
import {
	addResourceEnvVars,
	type EnvVars,
	filterAgentuitySdkKeys,
	findExistingEnvFile,
	readEnvFile,
	splitEnvAndSecrets,
} from '../../env-util';
import { ErrorCode } from '../../errors';
import { playSound } from '../../sound';
import * as tui from '../../tui';
import { createPrompt, note } from '../../tui';
import type { AuthData, Config } from '../../types';
import { getGithubBotIdentity } from '../git/api';
import { scaffoldFramework, setupProject, initGitRepo } from './scaffold';
import { frameworkCatalog, type FrameworkScaffold } from './frameworks';

interface CreateFlowOptions {
	projectName?: string;
	dir?: string;
	domains?: string[];
	framework?: string;
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
}

export interface CreateFlowResult {
	projectId?: string;
	orgId?: string;
	name: string;
	path: string;
	framework: string;
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
		framework: initialFramework,
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
	} = options;

	const isHeadless = !process.stdin.isTTY || !process.stdout.isTTY;
	const isInteractive = !skipPrompts && !isHeadless;

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

	// Step 1: Get project name
	let projectName = initialProjectName;

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
	projectName = projectName || 'My First App';

	// Generate disk-friendly directory name
	const dirName = projectName === '.' ? '.' : sanitizeDirectoryName(projectName);

	// Determine destination directory
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

	// Step 2: Select framework
	let selectedFramework: FrameworkScaffold;
	if (initialFramework) {
		const found = frameworkCatalog.find((f) => f.slug === initialFramework);
		if (!found) {
			const available = frameworkCatalog
				.map((f) => `  - ${f.slug.padEnd(15)} ${f.description}`)
				.join('\n');
			logger.fatal(
				`Framework "${initialFramework}" not found\n\nAvailable frameworks:\n${available}`,
				ErrorCode.RESOURCE_NOT_FOUND
			);
			return undefined as never;
		}
		selectedFramework = found;
	} else if (!isInteractive || frameworkCatalog.length === 1) {
		const firstFramework = frameworkCatalog[0];
		if (!firstFramework) {
			logger.fatal('No frameworks available', ErrorCode.RESOURCE_NOT_FOUND);
			return undefined as never;
		}
		selectedFramework = firstFramework;
	} else {
		let maxLength = 15;
		frameworkCatalog.forEach((f) => {
			if (maxLength < f.name.length) {
				maxLength = f.name.length;
			}
		});
		maxLength = Math.min(maxLength + 1, 40);
		const [_winWidth] = process.stdout.getWindowSize();
		const winWidth = _winWidth - maxLength - 8;
		const frameworkId = await prompt.select({
			message: 'Select a framework:',
			options: frameworkCatalog.map((f) => ({
				value: f.slug,
				label: f.name.padEnd(maxLength),
				hint:
					f.description.length > winWidth
						? f.description.substring(0, winWidth - 3) + '...'
						: f.description,
			})),
		});
		const found = frameworkCatalog.find((f) => f.slug === frameworkId);
		if (!found) {
			logger.fatal('Framework selection failed', ErrorCode.USER_CANCELLED);
			return undefined as never;
		}
		selectedFramework = found;
	}

	// Step 3: Ask about AI example
	let includeAiExample = true;
	if (isInteractive && selectedFramework.overlayDir) {
		includeAiExample = await prompt.confirm({
			message: 'Include an AI example? (OpenAI API route)',
			initial: true,
		});
	} else if (!selectedFramework.overlayDir) {
		includeAiExample = false;
	}

	// Step 4: Scaffold the framework
	await scaffoldFramework({
		dest,
		dirName,
		framework: selectedFramework,
		includeAiExample,
		logger,
	});

	// Step 5: Setup project (install deps)
	const setupResult = await setupProject({
		dest,
		projectName: projectName === '.' ? basename(dest) : projectName,
		noInstall: options.noInstall,
		logger,
	});

	// If setup failed, skip resource prompts and registration
	if (!setupResult.success) {
		tui.warning('Project setup failed. Skipping resource configuration.');
		return {
			name: projectName,
			path: dest,
			framework: selectedFramework.slug,
			installed: !options.noInstall,
			built: false,
			success: false,
			error: 'Project setup completed with errors',
		};
	}

	// ─── Resource provisioning (DB, storage, auth, DNS) ─────────────────────
	// This section is unchanged from the original flow.

	const canProvision = auth && apiClient && catalystClient && orgId && region;
	const hasResourceFlags =
		(databaseOption !== undefined && databaseOption.toLowerCase() !== 'skip') ||
		(storageOption !== undefined && storageOption.toLowerCase() !== 'skip');

	if (isInteractive && canProvision) {
		const { symbols, tuiColors } = tui;
		console.log(tuiColors.secondary(symbols.bar));
	}

	let _domains = domains;
	const resourceEnvVars: EnvVars = {};

	if (hasResourceFlags && !canProvision) {
		logger.fatal(
			'Cannot provision database/storage without being authenticated and registering the project.\n' +
				'Remove --no-register or omit --database/--storage flags.',
			ErrorCode.VALIDATION_FAILED
		);
	}

	if (canProvision) {
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
			logger.debug(
				`Resources for org ${orgId} in region ${region}: ${resources.db.length} databases, ${resources.s3.length} storage buckets`
			);
		}

		// Database action
		let db_action: string;
		if (databaseOption !== undefined) {
			if (databaseOption.toLowerCase() === 'new') {
				db_action = 'Create New';
			} else if (databaseOption.toLowerCase() === 'skip') {
				db_action = 'Skip';
			} else {
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
			db_action = 'Skip';
		}

		// Storage action
		let s3_action: string;
		if (storageOption !== undefined) {
			if (storageOption.toLowerCase() === 'new') {
				s3_action = 'Create New';
			} else if (storageOption.toLowerCase() === 'skip') {
				s3_action = 'Skip';
			} else {
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
			s3_action = 'Skip';
		}

		// Custom DNS
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

		// Process storage
		switch (s3_action) {
			case 'Create New': {
				let bucketName: string | undefined;
				let bucketDescription: string | undefined;

				if (isInteractive) {
					const bucketNameInput = await prompt.text({
						message: 'Bucket name',
						hint: 'Optional - lowercase letters, digits, hyphens only',
						validate: (value: string) => {
							const trimmed = value.trim();
							if (trimmed === '') return true;
							const result = validateBucketName(trimmed);
							return result.valid ? true : result.error!;
						},
					});
					bucketName = bucketNameInput.trim() || undefined;
					bucketDescription =
						(await prompt.text({
							message: 'Bucket description',
							hint: 'Optional - press Enter to skip',
						})) || undefined;
				}

				const created = await tui.spinner({
					message: 'Provisioning New Bucket',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient!, orgId!, region!, [
							{
								type: 's3',
								name: bucketName,
								description: bucketDescription,
							},
						]);
					},
				});
				if (created[0]?.env) {
					Object.assign(resourceEnvVars, created[0].env);
				}
				break;
			}
			case 'Skip':
				break;
			default: {
				const selectedBucket = resources?.s3.find((b) => b.bucket_name === s3_action);
				if (selectedBucket?.env) {
					Object.assign(resourceEnvVars, selectedBucket.env);
				}
				break;
			}
		}

		// Process database
		switch (db_action) {
			case 'Create New': {
				let dbName: string | undefined;
				let dbDescription: string | undefined;

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
				if (created[0]?.env) {
					Object.assign(resourceEnvVars, created[0].env);
				}
				break;
			}
			case 'Skip':
				break;
			default: {
				const selectedDb = resources?.db.find((d) => d.name === db_action);
				if (selectedDb?.env) {
					Object.assign(resourceEnvVars, selectedDb.env);
				}
				break;
			}
		}
	}

	// ─── Cloud registration ─────────────────────────────────────────────────

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

		// Write resource env vars
		if (Object.keys(resourceEnvVars).length > 0) {
			await addResourceEnvVars(dest, resourceEnvVars);
		}

		// Sync env vars to cloud
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
						logger.debug('Failed to sync environment variables:', error);
					}
				},
			});
		}
	}

	// ─── Git initialization ─────────────────────────────────────────────────

	let botAuthor: { name: string; email: string } | undefined;
	if (apiClient) {
		try {
			botAuthor = await getGithubBotIdentity(apiClient);
		} catch {
			// Non-fatal: fall back to generic Agentuity author
		}
	}

	await initGitRepo(dest, {
		projectName,
		source: `framework: ${selectedFramework.name}`,
		author: botAuthor,
	});

	// ─── Completion ─────────────────────────────────────────────────────────

	if (isInteractive) {
		if (setupResult.success) {
			tui.success('✨ Project created successfully!\n');
		} else {
			tui.warning('Project created with errors (see above)\n');
		}

		if (dirName !== '.') {
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
			const cloudRegion = region ?? process.env.AGENTUITY_REGION ?? 'usc';
			await promptForDNS(projectId, _domains, cloudRegion, config);
		}
	}

	return {
		projectId,
		orgId,
		name: projectName,
		path: dest,
		framework: selectedFramework.slug,
		installed: !options.noInstall,
		built: !options.noBuild && setupResult.success,
		domains: _domains,
		success: setupResult.success,
		error: setupResult.success ? undefined : 'Project setup completed with errors',
	};
}

/**
 * Sanitize a project name to create a safe directory/package name
 */
function sanitizeDirectoryName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/_+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/^[^a-z0-9]+/, '');
}
