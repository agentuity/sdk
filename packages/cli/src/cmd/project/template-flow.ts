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
import { downloadTemplate, initGitRepo, setupProject } from './download';
import { suggestBucketName, suggestDatabaseName } from './random-name';
import { fetchTemplates, type TemplateInfo } from './templates';

// Domain validator shared between the multi-select branch and the standalone prompt.
const DOMAIN_REGEX =
	/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,63}$/;

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

	// Resource provisioning gates
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

	if (canProvision) {
		// CLI flags pre-resolve their respective per-resource decision; the multi-select
		// is only used for resources where the user didn't pass a flag.
		const dbFlagAction = resolveFlagAction(databaseOption, 'database');
		const storageFlagAction = resolveFlagAction(storageOption, 'storage');
		const domainFlagProvided = (domains?.length ?? 0) > 0;

		// Determine which resources should run through the configuration phase.
		// In interactive mode, ask the user via a single multi-select.
		// In headless / non-interactive mode, only flagged resources are considered.
		let wantDb = dbFlagAction !== undefined && dbFlagAction !== 'Skip';
		let wantStorage = storageFlagAction !== undefined && storageFlagAction !== 'Skip';
		let wantDomain = domainFlagProvided;

		if (isInteractive) {
			// Build multi-select options dynamically: only show resources the user hasn't
			// already decided about via CLI flags. If all three came from flags, skip the prompt.
			const msOptions: {
				value: 'database' | 'storage' | 'domain';
				label: string;
				hint?: string;
			}[] = [];
			if (dbFlagAction === undefined) {
				msOptions.push({ value: 'database', label: 'SQL Database', hint: 'PostgreSQL' });
			}
			if (storageFlagAction === undefined) {
				msOptions.push({ value: 'storage', label: 'Storage Bucket', hint: 'S3-compatible' });
			}
			if (!domainFlagProvided) {
				msOptions.push({ value: 'domain', label: 'Custom Domain', hint: 'BYO domain' });
			}

			if (msOptions.length > 0) {
				const picked = await prompt.multiselect<'database' | 'storage' | 'domain'>({
					message: 'What would you like to set up? (all optional)',
					options: msOptions,
					initial: [],
				});
				if (dbFlagAction === undefined) wantDb = picked.includes('database');
				if (storageFlagAction === undefined) wantStorage = picked.includes('storage');
				if (!domainFlagProvided) wantDomain = picked.includes('domain');
			}
		}

		// Fetch existing resources only if we'll actually need them.
		// Need them when:
		//   - user wants db/storage in interactive mode (to offer "use existing")
		//   - a CLI flag pointed at an existing resource by name
		let resources: Awaited<ReturnType<typeof listResources>> | undefined;
		const needResources =
			(isInteractive && (wantDb || wantStorage)) ||
			(databaseOption !== undefined &&
				dbFlagAction !== 'Create New' &&
				dbFlagAction !== 'Skip') ||
			(storageOption !== undefined &&
				storageFlagAction !== 'Create New' &&
				storageFlagAction !== 'Skip');

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

			// Validate flag-supplied resource names against the fetched list.
			if (
				databaseOption !== undefined &&
				dbFlagAction !== 'Create New' &&
				dbFlagAction !== 'Skip' &&
				!resources.db.find((d) => d.name === dbFlagAction)
			) {
				logger.fatal(
					`Database '${databaseOption}' not found. Use 'new' to create a new database or 'skip' to skip.`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
			if (
				storageOption !== undefined &&
				storageFlagAction !== 'Create New' &&
				storageFlagAction !== 'Skip' &&
				!resources.s3.find((b) => b.bucket_name === storageFlagAction)
			) {
				logger.fatal(
					`Storage bucket '${storageOption}' not found. Use 'new' to create a new bucket or 'skip' to skip.`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
		}

		// === Configure each selected resource: Database → Storage → Domain ===

		// Database
		if (wantDb) {
			let dbAction = dbFlagAction;
			if (dbAction === undefined && isInteractive) {
				const existing = resources?.db ?? [];
				if (existing.length > 0) {
					dbAction = await prompt.select<string>({
						message: 'SQL Database',
						options: [
							{ value: 'Create New', label: 'Create a new database' },
							...existing.map((db) => ({
								value: db.name,
								label: `Use database: ${tui.tuiColors.primary(db.name)}`,
							})),
						],
					});
				} else {
					// No existing databases — user already opted in via the multi-select, so create new.
					dbAction = 'Create New';
				}
			}

			if (dbAction === 'Create New') {
				let dbName: string | undefined;
				let dbDescription: string | undefined;

				if (isInteractive) {
					const suggestion = suggestDatabaseName(projectName);
					const dbNameInput = await prompt.text({
						message: 'Database name',
						hint: 'Optional · lowercase letters, digits, underscores',
						placeholder: suggestion,
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
							hint: 'Optional · press Enter to skip',
						})) || undefined;
				}

				const created = await tui.spinner({
					message: 'Provisioning New SQL Database',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient!, orgId!, region!, [
							{ type: 'db', name: dbName, description: dbDescription },
						]);
					},
				});
				if (created[0]?.env) Object.assign(resourceEnvVars, created[0].env);
			} else if (dbAction && dbAction !== 'Skip') {
				// Existing database selected — reuse its env vars.
				const selectedDb = resources?.db.find((d) => d.name === dbAction);
				if (selectedDb?.env) Object.assign(resourceEnvVars, selectedDb.env);
			}
		}

		// Storage
		if (wantStorage) {
			let s3Action = storageFlagAction;
			if (s3Action === undefined && isInteractive) {
				const existing = resources?.s3 ?? [];
				if (existing.length > 0) {
					s3Action = await prompt.select<string>({
						message: 'Storage Bucket',
						options: [
							{ value: 'Create New', label: 'Create a new bucket' },
							...existing.map((bucket) => ({
								value: bucket.bucket_name,
								label: `Use bucket: ${tui.tuiColors.primary(bucket.bucket_name)}`,
							})),
						],
					});
				} else {
					s3Action = 'Create New';
				}
			}

			if (s3Action === 'Create New') {
				let bucketName: string | undefined;
				let bucketDescription: string | undefined;

				if (isInteractive) {
					const suggestion = suggestBucketName(projectName);
					const bucketNameInput = await prompt.text({
						message: 'Bucket name',
						hint: 'Optional · lowercase letters, digits, hyphens',
						placeholder: suggestion,
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
							hint: 'Optional · press Enter to skip',
						})) || undefined;
				}

				const created = await tui.spinner({
					message: 'Provisioning New Bucket',
					clearOnSuccess: true,
					callback: async () => {
						return createResources(catalystClient!, orgId!, region!, [
							{ type: 's3', name: bucketName, description: bucketDescription },
						]);
					},
				});
				if (created[0]?.env) Object.assign(resourceEnvVars, created[0].env);
			} else if (s3Action && s3Action !== 'Skip') {
				const selectedBucket = resources?.s3.find((b) => b.bucket_name === s3Action);
				if (selectedBucket?.env) Object.assign(resourceEnvVars, selectedBucket.env);
			}
		}

		// Custom Domain
		if (wantDomain && !domainFlagProvided && isInteractive) {
			const customDns = await prompt.text({
				message: 'Custom domain',
				hint: 'e.g. agents.example.com',
				validate: (val: string) =>
					val === ''
						? 'Domain is required (or go back and uncheck Custom Domain)'
						: DOMAIN_REGEX.test(val)
							? true
							: 'Invalid domain',
			});
			if (customDns) _domains = [customDns];
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

		// Write resource environment variables to .env
		if (Object.keys(resourceEnvVars).length > 0) {
			await addResourceEnvVars(dest, resourceEnvVars);
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

	// Fetch GitHub App bot identity for commit authorship (if authenticated)
	let botAuthor: { name: string; email: string } | undefined;
	if (apiClient) {
		try {
			botAuthor = await getGithubBotIdentity(apiClient);
		} catch {
			// Non-fatal: fall back to generic Agentuity author
		}
	}

	// Initialize git repository after all files are generated
	await initGitRepo(dest, {
		projectName,
		source: `template: ${selectedTemplate.name}`,
		author: botAuthor,
	});

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
			const cloudRegion = region ?? process.env.AGENTUITY_REGION ?? 'usc';
			await promptForDNS(projectId, _domains, cloudRegion, config);
		}
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
 * Normalize a CLI flag value (`--database` / `--storage`) into the same
 * action vocabulary the interactive flow uses:
 *   - 'new'  -> 'Create New'
 *   - 'skip' -> 'Skip'
 *   - any other string -> treated as an existing-resource name (returned as-is)
 *   - undefined -> undefined (no flag passed; multi-select decides)
 *
 * The existence check for named resources happens later, after the resource
 * list is fetched.
 */
function resolveFlagAction(
	flag: string | undefined,
	_kind: 'database' | 'storage'
): string | undefined {
	if (flag === undefined) return undefined;
	const lower = flag.toLowerCase();
	if (lower === 'new') return 'Create New';
	if (lower === 'skip') return 'Skip';
	return flag;
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
