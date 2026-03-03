import { join, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { Logger } from '@agentuity/core/index.ts';
import {
	projectGet,
	projectCreate,
	projectEnvUpdate,
	listOrganizations,
	type OrganizationList,
	type RegionList,
} from '@agentuity/server/index.ts';
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
import { fetchRegionsWithCache } from '../../regions.ts';
import { getCachedProject, setCachedProject } from '../../cache/index.ts';

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
	if (await Bun.file(pkgPath).exists()) {
		try {
			const pkg = await Bun.file(pkgPath).json();
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
	// Check 1: package.json with @agentuity/runtime and agentuity.config.ts
	const pkgPath = join(dir, 'package.json');
	const configPath = join(dir, 'agentuity.config.ts');

	if (await Bun.file(pkgPath).exists()) {
		try {
			const pkg = await Bun.file(pkgPath).json();
			const deps = { ...pkg.dependencies, ...pkg.devDependencies };
			if (deps['@agentuity/runtime'] && (await Bun.file(configPath).exists())) {
				return true;
			}
		} catch {
			// Fall through to check child project
		}
	}

	// Check 2: ./agentuity/ subdirectory exists with valid structure (parent project with child)
	const agentuityDir = join(dir, 'agentuity');
	if (existsSync(agentuityDir) && statSync(agentuityDir).isDirectory()) {
		const childPkgPath = join(agentuityDir, 'package.json');
		const childConfigPath = join(agentuityDir, 'agentuity.config.ts');

		if (await Bun.file(childPkgPath).exists()) {
			try {
				const childPkg = await Bun.file(childPkgPath).json();
				const childDeps = { ...childPkg.dependencies, ...childPkg.devDependencies };
				if (childDeps['@agentuity/runtime'] && (await Bun.file(childConfigPath).exists())) {
					return true;
				}
			} catch {
				// Invalid package.json in child - fall through
			}
		}
	}

	return false;
}

/**
 * Update or create .env file with new SDK key
 */
async function updateSdkKeyInEnv(dir: string, sdkKey: string): Promise<void> {
	const envPath = join(dir, '.env');
	const envFile = Bun.file(envPath);

	if (await envFile.exists()) {
		// Update existing .env - read, modify, write
		const existing = await readEnvFile(envPath);
		existing.AGENTUITY_SDK_KEY = sdkKey;
		await writeEnvFile(envPath, existing);
	} else {
		// Create new .env
		const comment =
			'# AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
		const content = `${comment}\nAGENTUITY_SDK_KEY=${sdkKey}\n`;
		await Bun.write(envPath, content);
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
 * Import an existing project (with invalid/inaccessible agentuity.json) to user's org
 */
async function importExistingProject(
	opts: ReconcileOptions,
	existingConfig: Project,
	orgs: OrganizationList,
	options?: { skipPrompt?: boolean }
): Promise<ReconcileResult> {
	const { dir, apiClient, config, logger } = opts;

	if (!options?.skipPrompt) {
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

	// Select org
	const orgId = await selectOrg(orgs, config, existingConfig.orgId);

	// Fetch regions and select
	const regions = await tui.spinner({
		message: 'Fetching regions',
		clearOnSuccess: true,
		callback: () => fetchRegionsWithCache(config.name, apiClient, logger),
	});
	const region = await selectRegion(regions, existingConfig.region);

	// Get project name
	const defaultName = await getDefaultProjectName(dir);
	const projectName = await textPrompt({
		message: 'Project name:',
		initial: defaultName,
		validate: (value: string) => {
			if (!value || value.trim().length === 0) {
				return 'Project name is required';
			}
			return true;
		},
	});

	// Create the project
	const newProject = await tui.spinner({
		message: 'Registering project',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name: projectName,
				orgId,
				cloudRegion: region,
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

	tui.warning('This project is not registered with Agentuity Cloud.');
	tui.newline();

	const shouldCreate = await tui.confirm('Would you like to register it now?', true);

	if (!shouldCreate) {
		return { status: 'skipped', message: 'Project registration cancelled.' };
	}

	tui.newline();

	// Fetch user's orgs
	const orgs = await tui.spinner({
		message: 'Fetching organizations',
		clearOnSuccess: true,
		callback: () => listOrganizations(apiClient),
	});

	if (orgs.length === 0) {
		return { status: 'error', message: 'No organizations found for your account.' };
	}

	// Select org
	const orgId = await selectOrg(orgs, config);

	// Fetch regions and select
	const regions = await tui.spinner({
		message: 'Fetching regions',
		clearOnSuccess: true,
		callback: () => fetchRegionsWithCache(config.name, apiClient, logger),
	});
	const region = await selectRegion(regions);

	// Get project name from package.json or prompt
	const defaultName = await getDefaultProjectName(dir);
	const projectName = await textPrompt({
		message: 'Project name:',
		initial: defaultName,
		validate: (value: string) => {
			if (!value || value.trim().length === 0) {
				return 'Project name is required';
			}
			return true;
		},
	});

	// Create the project
	const newProject = await tui.spinner({
		message: 'Registering project',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name: projectName,
				orgId,
				cloudRegion: region,
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
			if (!interactive || validateOnly) {
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

			if (!interactive || validateOnly) {
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
			message:
				'This directory does not appear to be a valid Agentuity project. ' +
				'Expected agentuity.config.ts and @agentuity/runtime dependency, ' +
				'or an agentuity/ subdirectory.',
		};
	}

	if (!interactive || validateOnly) {
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

	// Check if agentuity.json already exists and is valid
	const projectConfig = await tryLoadProjectConfig(dir, config);

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
			if (!interactive) {
				return {
					status: 'error',
					message:
						"You don't have access to this project. Run interactively to import it to your organization.",
				};
			}

			return await importExistingProject(opts, projectConfig, userOrgs);
		} catch {
			// Project doesn't exist - offer to import
			if (!interactive) {
				return {
					status: 'error',
					message: 'Project not found. Run interactively to import it to your organization.',
				};
			}

			const userOrgs = await listOrganizations(apiClient);
			return await importExistingProject(opts, projectConfig, userOrgs);
		}
	}

	// No agentuity.json - validate structure and create new project
	const isValid = await isValidProjectStructure(dir);

	if (!isValid) {
		return {
			status: 'error',
			message:
				'This directory does not appear to be a valid Agentuity project. ' +
				'Expected agentuity.config.ts and @agentuity/runtime dependency, ' +
				'or an agentuity/ subdirectory.',
		};
	}

	if (validateOnly) {
		return {
			status: 'valid',
			message: 'Project structure is valid and ready to import.',
		};
	}

	if (!interactive) {
		return {
			status: 'error',
			message: 'Project import requires interactive mode.',
		};
	}

	return await createNewProject(opts);
}
