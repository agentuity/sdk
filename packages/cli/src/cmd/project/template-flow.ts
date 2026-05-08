/**
 * Project creation flow — framework-first scaffolding.
 *
 * Instead of custom Agentuity templates, the user picks a framework
 * and we run its official create CLI, then augment with Agentuity integration.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
import type { APIClient } from '../../api.ts';
import { createProjectConfig } from '../../config.ts';
import { promptForDNS } from '../../domain.ts';
import {
	addResourceEnvVars,
	type EnvVars,
	filterAgentuitySdkKeys,
	findExistingEnvFile,
	readEnvFile,
	splitEnvAndSecrets,
} from '../../env-util.ts';
import { ErrorCode } from '../../errors.ts';
import { playSound } from '../../sound.ts';
import * as tui from '../../tui.ts';
import { createPrompt, note } from '../../tui.ts';
import type { AuthData, Config } from '../../types.ts';
import { getGithubBotIdentity } from '../git/api.ts';
import { scaffoldFramework, setupProject, initGitRepo } from './scaffold.ts';
import { composeServices } from './services-composer.ts';
import { getServiceCatalog, resolveSelection } from './services-catalog.ts';
import { suggestBucketName, suggestDatabaseName } from './random-name.ts';
import {
	flagRequiresProvisioning,
	resolveFlagAction,
	shouldPromptForResource,
} from './provisioning-decisions.ts';
import { runtimeKind } from '../../node-compat/runtime-info.ts';
import type { PackageManager } from '../build/detect/types.ts';
import { frameworkCatalog, type FrameworkScaffold } from './frameworks.ts';

/**
 * Permissive RFC 1035 / RFC 1123 hostname check, allowing UTF-8 labels.
 * Used by the custom-domain prompt; full DNS resolution happens server-
 * side when the project is registered.
 */
const DOMAIN_REGEX =
	/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,63}$/;

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
	/**
	 * Service augment ids to add ("db", "keyvalue", "queue", "vector",
	 * "storage"). When omitted in interactive mode, the user is asked via
	 * a multi-select. When omitted in non-interactive mode, no services
	 * are added.
	 */
	services?: string[];
	/**
	 * Package manager to drive the new project. When omitted, the
	 * interactive flow asks for it; non-interactive runs default to
	 * the host runtime (bun under Bun, npm under Node).
	 */
	packageManager?: PackageManager;
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
		services: servicesOption,
		packageManager: initialPackageManager,
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

	// Step 2: Select package manager
	//
	// We ask before framework so the framework's `createCommand`
	// can render the right `--use-bun` / `--use-npm` / etc. flag.
	// Default in non-interactive contexts is the host runtime
	// (bun under Bun, npm under Node) — keeps the new project
	// consistent with how the user invoked the CLI unless they
	// override it explicitly.
	const defaultPackageManager: PackageManager = runtimeKind() === 'bun' ? 'bun' : 'npm';
	let packageManager: PackageManager;
	if (initialPackageManager) {
		packageManager = initialPackageManager;
	} else if (!isInteractive) {
		packageManager = defaultPackageManager;
	} else {
		const pmChoice = await prompt.select<PackageManager>({
			message: 'Which package manager should the new project use?',
			initial: defaultPackageManager,
			options: [
				{
					value: 'bun',
					label: 'bun',
					hint: 'fast install + native TS runtime; the host CLI default under Bun',
				},
				{
					value: 'npm',
					label: 'npm',
					hint: 'ships with Node; safest cross-platform default',
				},
				{ value: 'pnpm', label: 'pnpm', hint: 'content-addressed store; popular in monorepos' },
				{ value: 'yarn', label: 'yarn', hint: 'classic alternative to npm' },
			],
		});
		if (!pmChoice) {
			logger.fatal('Package manager selection failed', ErrorCode.USER_CANCELLED);
			return undefined as never;
		}
		packageManager = pmChoice;
	}

	// Step 3: Select framework
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

	// Step 4: Ask about AI example
	let includeAiExample = true;
	if (isInteractive && selectedFramework.overlayDir) {
		includeAiExample = await prompt.confirm({
			message: 'Include an AI example? (OpenAI API route)',
			initial: true,
		});
	} else if (!selectedFramework.overlayDir) {
		includeAiExample = false;
	}

	// Step 5: Scaffold the framework
	await scaffoldFramework({
		dest,
		dirName,
		framework: selectedFramework,
		includeAiExample,
		packageManager,
		logger,
	});

	// Step 5.5: Resolve which service augments to apply.
	const selectedServices = await resolveServiceSelection({
		servicesOption,
		framework: selectedFramework.slug,
		isInteractive,
		prompt,
		logger,
	});

	// Step 5.6: Compose service augments. With no services selected this
	// still runs to strip marker comments seeded by the AI overlay so
	// user-visible files stay clean. Frameworks without a manifest are
	// skipped silently.
	await composeServices({
		dest,
		framework: selectedFramework.slug,
		selectedServices,
		logger,
	});

	// Step 6: Setup project (install deps)
	const setupResult = await setupProject({
		dest,
		projectName: projectName === '.' ? basename(dest) : projectName,
		noInstall: options.noInstall,
		packageManager,
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

	// ─── Resource provisioning (DB, storage, custom domain) ────────────────
	//
	// What runs here is driven by the service multi-select the user
	// answered earlier: only services they opted in to are prompted for.
	// CLI flags (--database, --storage, --domains) still work and short-
	// circuit the corresponding prompt, so headless callers can opt in
	// without going through the multi-select.
	//
	// Selection rules:
	//   * Service in selectedServices  → prompt for that resource.
	//   * Flag set to a non-skip value → prompt for that resource.
	//   * Flag set to 'skip'           → do nothing (overrides service).
	//   * Neither                       → do nothing.

	const canProvision = auth && apiClient && catalystClient && orgId && region;

	const dbFlagAction = resolveFlagAction(databaseOption);
	const storageFlagAction = resolveFlagAction(storageOption);
	const domainFlagProvided = (domains?.length ?? 0) > 0;

	const wantDb = shouldPromptForResource({
		flagAction: dbFlagAction,
		inServiceSelection: selectedServices.includes('db'),
	});
	const wantStorage = shouldPromptForResource({
		flagAction: storageFlagAction,
		inServiceSelection: selectedServices.includes('storage'),
	});

	if (isInteractive && canProvision && (wantDb || wantStorage || !domainFlagProvided)) {
		const { symbols, tuiColors } = tui;
		console.log(tuiColors.secondary(symbols.bar));
	}

	let _domains = domains;
	const resourceEnvVars: EnvVars = {};

	// If a flag asks for provisioning but we can't, fail loudly. Service
	// selection alone never triggers this fatal: scaffolds without
	// authentication still land the code, the user just has to set env
	// vars later.
	if (
		(flagRequiresProvisioning(databaseOption) || flagRequiresProvisioning(storageOption)) &&
		!canProvision
	) {
		logger.fatal(
			'Cannot provision database/storage without being authenticated and registering the project.\n' +
				'Remove --no-register or omit --database/--storage flags.',
			ErrorCode.VALIDATION_FAILED
		);
	}

	if (canProvision && (wantDb || wantStorage)) {
		// Fetch existing resources only when we'll actually present a choice
		// or need to validate a flag-supplied name.
		const needResources =
			(isInteractive && (wantDb || wantStorage)) ||
			(databaseOption !== undefined &&
				dbFlagAction !== 'Create New' &&
				dbFlagAction !== 'Skip') ||
			(storageOption !== undefined &&
				storageFlagAction !== 'Create New' &&
				storageFlagAction !== 'Skip');

		let resources: Awaited<ReturnType<typeof listResources>> | undefined;
		if (needResources) {
			resources = await tui.spinner({
				message: 'Fetching resources',
				clearOnSuccess: true,
				callback: async () => listResources(catalystClient!, orgId!, region!),
			});
			logger.debug(
				`Resources for org ${orgId} in region ${region}: ${resources.db.length} databases, ${resources.s3.length} storage buckets`
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

		// === Database ===
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
					// No existing databases — user opted in via the multi-select
					// (or a flag), so skip the choice and create new.
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
					callback: async () =>
						createResources(catalystClient!, orgId!, region!, [
							{ type: 'db', name: dbName, description: dbDescription },
						]),
				});
				if (created[0]?.env) Object.assign(resourceEnvVars, created[0].env);
			} else if (dbAction && dbAction !== 'Skip') {
				const selectedDb = resources?.db.find((d) => d.name === dbAction);
				if (selectedDb?.env) Object.assign(resourceEnvVars, selectedDb.env);
			}
		}

		// === Storage ===
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
					callback: async () =>
						createResources(catalystClient!, orgId!, region!, [
							{ type: 's3', name: bucketName, description: bucketDescription },
						]),
				});
				if (created[0]?.env) Object.assign(resourceEnvVars, created[0].env);
			} else if (s3Action && s3Action !== 'Skip') {
				const selectedBucket = resources?.s3.find((b) => b.bucket_name === s3Action);
				if (selectedBucket?.env) Object.assign(resourceEnvVars, selectedBucket.env);
			}
		}
	}

	// === Custom domain ===
	//
	// Domain isn't a service augment — it's a deployment concern. Ask
	// independently of the service multi-select. Flag value short-circuits
	// the prompt entirely.
	if (!domainFlagProvided && isInteractive && canProvision) {
		const customDns = await prompt.text({
			message: 'Custom domain',
			hint: 'Optional · press Enter to skip',
			validate: (val: string) =>
				val === ''
					? true
					: DOMAIN_REGEX.test(val)
						? true
						: 'Invalid domain (e.g. agents.example.com)',
		});
		if (customDns) _domains = [customDns];
	}

	// ─── Cloud registration ─────────────────────────────────────────────────

	let projectId: string | undefined;

	if (auth && apiClient && orgId) {
		const cloudRegion = region ?? process.env.AGENTUITY_REGION ?? 'usc';

		const pkgJsonPath = resolve(dest, 'package.json');
		let pkgJson: { description?: string; keywords?: string[] } = {};
		if (existsSync(pkgJsonPath)) {
			pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
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

	await playSound();

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
 * Resolve the user's chosen service augments.
 *
 * Three input shapes feed this:
 *   - `--services <list>` (or programmatic `services` option). Wins
 *     unconditionally; we validate ids and apply transitive `requires`.
 *   - Interactive scaffold with no flag: show a multi-select prompt.
 *   - Headless scaffold with no flag: empty selection (no services).
 *
 * Returns the resolved id list to pass to `composeServices`. Service
 * order is normalized to catalog order so downstream composition is
 * deterministic.
 */
async function resolveServiceSelection(opts: {
	servicesOption?: string[];
	framework: string;
	isInteractive: boolean;
	prompt: ReturnType<typeof createPrompt>;
	logger: Logger;
}): Promise<string[]> {
	const { servicesOption, framework, isInteractive, prompt, logger } = opts;

	const catalog = getServiceCatalog().filter((s) => s.frameworks.includes(framework as never));

	// CLI-flag path: validate ids loudly and let the composer apply
	// `requires` resolution deterministically.
	if (servicesOption !== undefined) {
		const known = new Set(catalog.map((s) => s.id));
		const unknown = servicesOption.filter((id) => !known.has(id));
		if (unknown.length > 0) {
			logger.fatal(
				`Unknown service id(s): ${unknown.join(', ')}. Available for ${framework}: ${catalog
					.map((s) => s.id)
					.join(', ')}`,
				ErrorCode.VALIDATION_FAILED
			);
			return [];
		}
		return resolveSelection(servicesOption, catalog).map((s) => s.id);
	}

	// Headless without a flag: no services.
	if (!isInteractive) return [];

	// No services available for this framework. Don't prompt.
	if (catalog.length === 0) return [];

	const picked = await prompt.multiselect<string>({
		message: 'Add service augments? (optional)',
		options: catalog.map((s) => ({
			value: s.id,
			label: s.label,
			hint: s.hint,
		})),
		initial: [],
	});

	const resolved = resolveSelection(picked, catalog);
	const auto = resolved.filter((s) => !picked.includes(s.id));
	if (auto.length > 0) {
		tui.info(`Adding required dependency: ${auto.map((s) => s.label).join(', ')}`);
	}
	return resolved.map((s) => s.id);
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
