import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { pathExists } from '../../node-compat/fs.ts';
import {
	projectGet,
	projectCreate,
	projectEnvUpdate,
	listOrganizations,
	type OrganizationList,
	type RegionList,
} from '@agentuity/server';
import type { APIClient } from '../../api.ts';
import type { AuthData, Config, Project } from '../../types.ts';
import { loadProjectConfig, createProjectConfig } from '../../config.ts';
import * as tui from '../../tui.ts';
import { createPrompt } from '../../tui.ts';
import { isTTY } from '../../auth.ts';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
} from '../../env-util.ts';
import { NO_DEPLOYABLE_PROJECT_MESSAGE } from '../build/detect/index.ts';
import { fetchRegionsWithCache } from '../../regions.ts';
import { getCachedProject, setCachedProject } from '../../cache/index.ts';
import { detectProjectRegistrationMetadata } from './registration-metadata.ts';

export interface ReconcileResult {
	status: 'valid' | 'imported' | 'skipped' | 'error';
	project?: Project;
	message?: string;
}

export interface ReconcileOptions {
	dir: string;
	auth: AuthData;
	apiClient: APIClient;
	config: Config;
	logger: Logger;
	interactive?: boolean;
	/** If true, skip prompts and just validate */
	validateOnly?: boolean;
	/** If true, auto-confirm all prompts (--confirm flag) */
	confirm?: boolean;
	/** Pre-selected organization ID (skips org selection prompt) */
	orgId?: string;
	/** Pre-selected region (skips region selection prompt) */
	region?: string;
	/** Project name from --name flag */
	name?: string;
	/** Existing cloud project ID to bind the local directory to. */
	projectId?: string;
	/**
	 * When true, suppress the "Would you like to register it now?"
	 * confirmation in `createNewProject`. Use this when the caller has
	 * already obtained explicit consent to register — e.g. the user
	 * typed `agentuity project import`, or answered "yes" to the
	 * existing-project detour in `agentuity project create`.
	 */
	skipRegisterPrompt?: boolean;
}

/**
 * Dependencies that can be injected for testing
 */
export interface ReconcileDeps {
	projectGet: typeof projectGet;
	projectCreate: typeof projectCreate;
	projectEnvUpdate: typeof projectEnvUpdate;
	listOrganizations: typeof listOrganizations;
	loadProjectConfig: typeof loadProjectConfig;
	createProjectConfig: typeof createProjectConfig;
	isTTY: typeof isTTY;
	confirm: typeof tui.confirm;
	selectOrganization: typeof tui.selectOrganization;
}

const defaultDeps: ReconcileDeps = {
	projectGet,
	projectCreate,
	projectEnvUpdate,
	listOrganizations,
	loadProjectConfig,
	createProjectConfig,
	isTTY,
	confirm: tui.confirm,
	selectOrganization: tui.selectOrganization,
};

/**
 * Try to load project config, returning null if not found or invalid
 * @internal Exported for testing
 */
export async function tryLoadProjectConfig(
	dir: string,
	config: Config | null,
	deps: Pick<ReconcileDeps, 'loadProjectConfig'> = defaultDeps
): Promise<Project | null> {
	try {
		return await deps.loadProjectConfig(dir, config);
	} catch {
		return null;
	}
}

/**
 * Get the default project name from package.json or directory name
 * @internal Exported for testing
 */
export async function getDefaultProjectName(dir: string): Promise<string> {
	const pkgPath = join(dir, 'package.json');
	if (await pathExists(pkgPath)) {
		try {
			const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
			if (pkg.name && typeof pkg.name === 'string' && pkg.name.trim()) {
				// Strip org scope if present (e.g., @myorg/project-name -> project-name)
				return pkg.name.replace(/^@[^/]+\//, '').trim();
			}
		} catch {
			// Fall through to directory name
		}
	}
	return basename(dir);
}

/**
 * Check if a directory contains a valid Agentuity project structure
 * @internal Exported for testing
 */
export async function isValidProjectStructure(dir: string): Promise<boolean> {
	// Check 1: package.json exists (any JS/TS project is valid)
	const pkgPath = join(dir, 'package.json');

	if (await pathExists(pkgPath)) {
		try {
			const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
			// Valid if it has a name and at least some structure
			if (pkg.name || pkg.dependencies || pkg.devDependencies) {
				return true;
			}
		} catch {
			// Invalid package.json
		}
	}

	// Check 2: ./agentuity/ subdirectory exists with a package.json (parent project with child)
	const agentuityDir = join(dir, 'agentuity');
	if (existsSync(agentuityDir) && statSync(agentuityDir).isDirectory()) {
		const childPkgPath = join(agentuityDir, 'package.json');

		if (await pathExists(childPkgPath)) {
			return true;
		}
	}

	// Check 3: bare static HTML deploy (index.html with no package.json).
	// Must stay in sync with `detectBareStaticHtml` in build/detect/index.ts:
	// anything detection accepts as a non-package.json entrypoint must also
	// pass here, or import will reject projects that deploy would build.
	if (await pathExists(join(dir, 'index.html'))) {
		return true;
	}

	return false;
}

/**
 * Update or create .env file with new SDK key
 */
async function updateSdkKeyInEnv(dir: string, sdkKey: string): Promise<void> {
	const envPath = join(dir, '.env');

	if (await pathExists(envPath)) {
		// Update existing .env - read, modify, write
		const existing = await readEnvFile(envPath);
		existing.AGENTUITY_SDK_KEY = sdkKey;
		await writeEnvFile(envPath, existing);
	} else {
		// Create new .env
		const comment =
			'# AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
		const content = `${comment}\nAGENTUITY_SDK_KEY=${sdkKey}\n`;
		await writeFile(envPath, content);
	}
}

/**
 * Sync existing environment variables to the new project
 */
async function syncEnvToProject(
	dir: string,
	projectId: string,
	apiClient: APIClient,
	logger: Logger
): Promise<void> {
	try {
		const envFilePath = await findExistingEnvFile(dir);
		const localEnv = await readEnvFile(envFilePath);
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredEnv).length > 0) {
			const { env, secrets } = splitEnvAndSecrets(filteredEnv);
			await projectEnvUpdate(apiClient, {
				id: projectId,
				env,
				secrets,
			});
			logger.debug(`Synced ${Object.keys(filteredEnv).length} environment variables to cloud`);
		}
	} catch (error) {
		// Non-fatal: just log the error
		logger.debug('Failed to sync environment variables:', error);
	}
}

/**
 * Prompt user to select an organization
 */
async function selectOrg(
	orgs: OrganizationList,
	config: Config,
	defaultOrgId?: string
): Promise<string> {
	return tui.selectOrganization(orgs, defaultOrgId ?? config.preferences?.orgId);
}

/**
 * Prompt user to select a region from the available regions
 */
async function selectRegion(regions: RegionList, defaultRegion?: string): Promise<string> {
	if (regions.length === 0) {
		throw new Error('No cloud regions available');
	}

	const firstRegion = regions[0];
	if (regions.length === 1 && firstRegion) {
		return firstRegion.region;
	}

	// Check for non-interactive mode before prompting
	const isNonInteractive = !process.stdin.isTTY || !process.stdout.isTTY;
	if (isNonInteractive) {
		// In non-interactive mode, validate defaultRegion against available regions
		if (defaultRegion) {
			const isValidRegion = regions.some((r) => r.region === defaultRegion);
			if (isValidRegion) {
				return defaultRegion;
			}
			const supportedRegions = regions.map((r) => r.region).join(', ');
			tui.fatal(
				`Region "${defaultRegion}" is not supported. ` +
					`Available regions: ${supportedRegions}. ` +
					'Use --region flag or set AGENTUITY_REGION environment variable with a valid region.'
			);
		}
		const supportedRegions = regions.map((r) => r.region).join(', ');
		tui.fatal(
			'Cannot select region in non-interactive mode. ' +
				`Available regions: ${supportedRegions}. ` +
				'Use --region flag or set AGENTUITY_REGION environment variable.'
		);
	}

	// Build options from API regions
	const options = regions.map((r) => ({
		value: r.region,
		label: `${r.description} (${r.region})`,
	}));

	// Move default to top if found
	const defaultValue = defaultRegion ?? firstRegion?.region ?? '';
	const defaultIndex = options.findIndex((r) => r.value === defaultValue);
	if (defaultIndex > 0) {
		const [defaultItem] = options.splice(defaultIndex, 1);
		if (defaultItem) {
			options.unshift(defaultItem);
		}
	}

	const prompt = createPrompt();
	const firstOption = options[0];
	return prompt.select({
		message: 'Select a region:',
		options,
		initial: firstOption?.value ?? '',
	});
}

/**
 * Prompt user for text input with validation
 */
async function textPrompt(options: {
	message: string;
	initial?: string;
	validate?: (value: string) => boolean | string;
}): Promise<string> {
	// Check for non-interactive mode before prompting
	const isNonInteractive = !process.stdin.isTTY || !process.stdout.isTTY;
	if (isNonInteractive) {
		// In non-interactive mode, use initial value if available and valid
		if (options.initial) {
			const validationResult = options.validate?.(options.initial);
			if (validationResult === true || validationResult === undefined) {
				return options.initial;
			}
		}
		tui.fatal(
			'Cannot prompt for input in non-interactive mode. ' +
				'Use --name flag to specify the project name.'
		);
	}

	const prompt = createPrompt();
	return prompt.text({
		message: options.message,
		initial: options.initial,
		hint: options.initial ? `(default: ${options.initial})` : undefined,
		validate: options.validate,
	});
}

/**
 * Resolve the cloud project display name for registration/import.
 * Explicit CLI names are always authoritative over package.json defaults.
 * @internal Exported for testing.
 */
export async function resolveProjectRegistrationName(
	opts: Pick<ReconcileOptions, 'dir' | 'name' | 'confirm'>
): Promise<string> {
	if (opts.name !== undefined) {
		const trimmed = opts.name.trim();
		if (trimmed.length === 0) {
			throw new Error('Project name is required.');
		}
		return trimmed;
	}

	const defaultName = await getDefaultProjectName(opts.dir);
	if (opts.confirm) {
		return defaultName;
	}

	return textPrompt({
		message: 'Project name:',
		initial: defaultName,
		validate: (value: string) => {
			if (!value || value.trim().length === 0) {
				return 'Project name is required';
			}
			return true;
		},
	});
}

/**
 * Import an existing project (with invalid/inaccessible agentuity.json) to user's org
 */
async function importExistingProject(
	opts: ReconcileOptions,
	existingConfig: Project,
	orgs: OrganizationList,
	options?: { skipPrompt?: boolean }
): Promise<ReconcileResult> {
	const { dir, apiClient, config, logger } = opts;

	if (!options?.skipPrompt && opts.interactive !== false) {
		tui.warning(
			"You don't have access to this project. It may have been deleted or transferred to another organization."
		);
		tui.newline();

		const shouldImport = await tui.confirm(
			'Would you like to import this project to your organization?',
			true
		);

		if (!shouldImport) {
			return { status: 'skipped', message: 'Project import cancelled.' };
		}

		tui.newline();
	}

	// Select org - use --org-id if provided, otherwise auto-select or prompt
	let orgId: string;
	if (opts.orgId) {
		orgId = opts.orgId;
	} else if (opts.confirm) {
		orgId = await tui.selectOrganization(orgs, config.preferences?.orgId, true);
	} else {
		orgId = await selectOrg(orgs, config, existingConfig.orgId);
	}

	// Select region (use pre-selected if available, otherwise fetch and prompt/auto-select)
	let region: string;
	if (opts.region) {
		region = opts.region;
	} else {
		const regions = await tui.spinner({
			message: 'Fetching regions',
			clearOnSuccess: true,
			callback: () => fetchRegionsWithCache(config.name, apiClient, logger),
		});

		if (opts.confirm) {
			// Auto-select: use existing config region if valid, otherwise first available
			const defaultRegion = existingConfig.region;
			if (defaultRegion && regions.some((r) => r.region === defaultRegion)) {
				region = defaultRegion;
			} else {
				const firstRegion = regions[0];
				if (!firstRegion) {
					return { status: 'error', message: 'No cloud regions available.' };
				}
				region = firstRegion.region;
			}
		} else {
			region = await selectRegion(regions, existingConfig.region);
		}
	}

	let projectName: string;
	try {
		projectName = await resolveProjectRegistrationName(opts);
	} catch (err) {
		return {
			status: 'error',
			message: err instanceof Error ? err.message : 'Project name is required.',
		};
	}

	const registrationMetadata = await detectProjectRegistrationMetadata(dir);

	// Create the project
	const newProject = await tui.spinner({
		message: 'Registering project',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name: projectName,
				orgId,
				cloudRegion: region,
				...registrationMetadata,
			});
		},
	});

	// Update .env with new SDK key
	await updateSdkKeyInEnv(dir, newProject.sdkKey);
	tui.success('Updated AGENTUITY_SDK_KEY in .env');

	// Create new agentuity.json
	await createProjectConfig(dir, {
		projectId: newProject.id,
		orgId,
		sdkKey: newProject.sdkKey,
		region,
	});
	tui.success('Updated agentuity.json');

	// Sync env vars
	await tui.spinner({
		message: 'Syncing environment variables',
		clearOnSuccess: true,
		callback: () => syncEnvToProject(dir, newProject.id, apiClient, logger),
	});

	const project: Project = {
		projectId: newProject.id,
		orgId,
		region,
	};

	tui.success('Project imported successfully!');

	return { status: 'imported', project };
}

/**
 * Create a new project from an unregistered local project
 */
async function createNewProject(opts: ReconcileOptions): Promise<ReconcileResult> {
	const { dir, apiClient, config, logger } = opts;

	// Skip the "register now?" prompt when the caller already has
	// explicit consent (`runProjectImport`, or the create-detour after
	// the user accepted "import this project instead"). Asking again is
	// a noisy double-confirm that made the flow feel split.
	if (opts.interactive !== false && !opts.skipRegisterPrompt) {
		tui.warning('This project is not registered with Agentuity Cloud.');
		tui.newline();

		const shouldCreate = await tui.confirm('Would you like to register it now?', true);

		if (!shouldCreate) {
			return { status: 'skipped', message: 'Project registration cancelled.' };
		}

		tui.newline();
	}

	// Select org - use --org-id if provided, otherwise fetch and select/auto-select
	let orgId: string;
	if (opts.orgId) {
		orgId = opts.orgId;
	} else {
		// Fetch user's orgs
		const orgs = await tui.spinner({
			message: 'Fetching organizations',
			clearOnSuccess: true,
			callback: () => listOrganizations(apiClient),
		});

		if (orgs.length === 0) {
			return { status: 'error', message: 'No organizations found for your account.' };
		}

		if (opts.confirm) {
			orgId = await tui.selectOrganization(orgs, config.preferences?.orgId, true);
		} else {
			orgId = await selectOrg(orgs, config);
		}
	}

	// Select region (use pre-selected if available, otherwise fetch and prompt/auto-select)
	let region: string;
	if (opts.region) {
		region = opts.region;
	} else {
		const regions = await tui.spinner({
			message: 'Fetching regions',
			clearOnSuccess: true,
			callback: () => fetchRegionsWithCache(config.name, apiClient, logger),
		});

		if (opts.confirm) {
			const firstRegion = regions[0];
			if (!firstRegion) {
				return { status: 'error', message: 'No cloud regions available.' };
			}
			region = firstRegion.region;
		} else {
			region = await selectRegion(regions);
		}
	}

	let projectName: string;
	try {
		projectName = await resolveProjectRegistrationName(opts);
	} catch (err) {
		return {
			status: 'error',
			message: err instanceof Error ? err.message : 'Project name is required.',
		};
	}

	const registrationMetadata = await detectProjectRegistrationMetadata(dir);

	// Create the project
	const newProject = await tui.spinner({
		message: 'Registering project',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name: projectName,
				orgId,
				cloudRegion: region,
				...registrationMetadata,
			});
		},
	});

	// Update/create .env with SDK key
	await updateSdkKeyInEnv(dir, newProject.sdkKey);
	tui.success('Updated AGENTUITY_SDK_KEY in .env');

	// Create agentuity.json
	await createProjectConfig(dir, {
		projectId: newProject.id,
		orgId,
		sdkKey: newProject.sdkKey,
		region,
	});
	tui.success('Created agentuity.json');

	// Sync env vars
	await tui.spinner({
		message: 'Syncing environment variables',
		clearOnSuccess: true,
		callback: () => syncEnvToProject(dir, newProject.id, apiClient, logger),
	});

	const project: Project = {
		projectId: newProject.id,
		orgId,
		region,
	};

	tui.success('Project registered successfully!');

	return { status: 'imported', project };
}

/**
 * Bind an unregistered local project to an existing Agentuity cloud project.
 */
async function importIntoExistingProject(opts: ReconcileOptions): Promise<ReconcileResult> {
	const projectId = opts.projectId?.trim();
	if (!projectId) {
		return { status: 'error', message: 'Project ID is required.' };
	}

	const isValid = await isValidProjectStructure(opts.dir);
	if (!isValid) {
		return {
			status: 'error',
			message: NO_DEPLOYABLE_PROJECT_MESSAGE,
		};
	}

	if (!opts.confirm) {
		if (!opts.interactive) {
			return {
				status: 'error',
				message: 'Project import requires interactive mode.',
			};
		}
		const shouldImport = await tui.confirm(
			`Bind this directory to existing project ${projectId}?`,
			true
		);
		if (!shouldImport) {
			return { status: 'skipped', message: 'Import cancelled.' };
		}
	}

	let project: Awaited<ReturnType<typeof projectGet>>;
	try {
		project = await tui.spinner({
			message: 'Fetching project',
			clearOnSuccess: true,
			callback: () => projectGet(opts.apiClient, { id: projectId, mask: false, keys: true }),
		});
	} catch {
		// Match the registered-project path: fetch failures become a structured
		// error instead of an uncaught throw (keeps --json output well-formed).
		return {
			status: 'error',
			message: `Could not load project ${projectId}. Check the project ID and your access, then try again.`,
		};
	}
	const sdkKey = project.api_key?.trim();
	if (!sdkKey) {
		return {
			status: 'error',
			message: 'Could not load an SDK key for the selected project.',
		};
	}
	const region = project.cloudRegion?.trim() || opts.region?.trim() || 'usc';

	await createProjectConfig(opts.dir, {
		projectId: project.id,
		orgId: project.orgId,
		sdkKey,
		region,
	});
	tui.success('Updated agentuity.json and AGENTUITY_SDK_KEY in .env');

	tui.success('Project imported successfully!');

	return {
		status: 'imported',
		project: {
			projectId: project.id,
			orgId: project.orgId,
			region,
		},
	};
}

/**
 * Reconcile a project - validate access or import if needed
 *
 * This function checks if the current directory has a valid agentuity.json
 * and if the user has access to the project. If not, it offers to import
 * the project to the user's organization.
 *
 * For directories without agentuity.json, it validates the project structure
 * and offers to register the project with Agentuity Cloud.
 */
export async function reconcileProject(opts: ReconcileOptions): Promise<ReconcileResult> {
	const { dir, apiClient, config, logger, interactive = isTTY(), validateOnly } = opts;

	// 1. Check if agentuity.json exists
	const projectConfig = await tryLoadProjectConfig(dir, config);

	if (projectConfig) {
		// 2. Validate access to existing project
		try {
			// Check cache first to avoid duplicate API calls
			const profile = config?.name ?? 'default';
			let project = getCachedProject(profile, projectConfig.projectId);
			if (!project) {
				project = await projectGet(apiClient, { id: projectConfig.projectId, keys: false });
				setCachedProject(profile, projectConfig.projectId, project);
			}

			// 3. Check if orgId matches user's orgs
			const userOrgs = await listOrganizations(apiClient);
			const hasAccess = userOrgs.some((org) => org.id === project.orgId);

			if (hasAccess) {
				return { status: 'valid', project: projectConfig };
			}

			// User doesn't have access - offer to import
			if ((!interactive && !opts.confirm) || validateOnly) {
				return {
					status: 'error',
					message:
						"You don't have access to this project. Run interactively to import it to your organization.",
				};
			}

			return await importExistingProject(opts, projectConfig, userOrgs);
		} catch (err) {
			// Project not found or access denied
			logger.debug('Failed to get project:', err);

			if ((!interactive && !opts.confirm) || validateOnly) {
				return {
					status: 'error',
					message:
						'Project not found or access denied. Run interactively to import it to your organization.',
				};
			}

			const userOrgs = await listOrganizations(apiClient);
			return await importExistingProject(opts, projectConfig, userOrgs);
		}
	}

	// 4. No agentuity.json - validate project structure
	const isValid = await isValidProjectStructure(dir);

	if (!isValid) {
		return {
			status: 'error',
			message: NO_DEPLOYABLE_PROJECT_MESSAGE,
		};
	}

	if ((!interactive && !opts.confirm) || validateOnly) {
		return {
			status: 'error',
			message:
				'Project must be registered with Agentuity Cloud. ' +
				'Run interactively or use "agentuity project import".',
		};
	}

	// 5. Prompt to create new project
	return await createNewProject(opts);
}

/**
 * Run project import directly (for the import command)
 */
export async function runProjectImport(opts: ReconcileOptions): Promise<ReconcileResult> {
	const { dir, apiClient, config, interactive = true, validateOnly = false } = opts;
	const projectId = opts.projectId?.trim();

	// Check if agentuity.json already exists and is valid
	const projectConfig = await tryLoadProjectConfig(dir, config);

	if (validateOnly && projectId && projectConfig?.projectId !== projectId) {
		const isValid = await isValidProjectStructure(dir);
		if (!isValid) {
			return {
				status: 'error',
				message: NO_DEPLOYABLE_PROJECT_MESSAGE,
			};
		}

		return {
			status: 'valid',
			message: 'Project structure is valid and ready to import.',
		};
	}

	if (projectId && (!projectConfig || projectConfig.projectId !== projectId)) {
		return await importIntoExistingProject({ ...opts, interactive });
	}

	if (projectConfig) {
		try {
			// Check cache first to avoid duplicate API calls
			const profile = config?.name ?? 'default';
			let project = getCachedProject(profile, projectConfig.projectId);
			if (!project) {
				project = await projectGet(apiClient, { id: projectConfig.projectId, keys: false });
				setCachedProject(profile, projectConfig.projectId, project);
			}
			const userOrgs = await listOrganizations(apiClient);
			const hasAccess = userOrgs.some((org) => org.id === project.orgId);

			if (hasAccess) {
				if (validateOnly) {
					return { status: 'valid', project: projectConfig };
				}

				tui.info('This project is already registered and you have access to it.');

				if (interactive) {
					tui.newline();
					const shouldReimport = await tui.confirm(
						'Would you like to import it to a different organization?',
						false
					);
					if (shouldReimport) {
						tui.newline();
						return await importExistingProject(opts, projectConfig, userOrgs, {
							skipPrompt: true,
						});
					}
				}

				return { status: 'valid', project: projectConfig };
			}

			// Has agentuity.json but no access - offer to import
			if ((!interactive && !opts.confirm) || validateOnly) {
				return {
					status: 'error',
					message:
						"You don't have access to this project. Run interactively to import it to your organization.",
				};
			}

			return await importExistingProject(opts, projectConfig, userOrgs, {
				skipPrompt: opts.confirm,
			});
		} catch {
			// Project doesn't exist - offer to import
			if ((!interactive && !opts.confirm) || validateOnly) {
				return {
					status: 'error',
					message: 'Project not found. Run interactively to import it to your organization.',
				};
			}

			const userOrgs = await listOrganizations(apiClient);
			return await importExistingProject(opts, projectConfig, userOrgs, {
				skipPrompt: opts.confirm,
			});
		}
	}

	// No agentuity.json - validate structure and create new project
	const isValid = await isValidProjectStructure(dir);

	if (!isValid && !opts.confirm) {
		return {
			status: 'error',
			message: NO_DEPLOYABLE_PROJECT_MESSAGE,
		};
	}

	if (validateOnly) {
		return {
			status: 'valid',
			message: 'Project structure is valid and ready to import.',
		};
	}

	if (!interactive && !opts.confirm) {
		return {
			status: 'error',
			message: 'Project import requires interactive mode.',
		};
	}

	// User explicitly invoked `project import` (or accepted the create
	// detour); skip the redundant "register it now?" confirm inside
	// createNewProject.
	return await createNewProject({ ...opts, skipRegisterPrompt: true });
}
