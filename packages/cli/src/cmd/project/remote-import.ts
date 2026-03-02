import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Logger, parseEnvExample, StructuredError } from '@agentuity/core';
import {
	createQueue,
	createResources,
	listOrganizations,
	listQueues,
	listResources,
	projectCreate,
	validateDatabaseName,
} from '@agentuity/server';
import type { APIClient } from '../../api';
import { isTTY } from '../../auth';
import {
	createProjectConfig,
	getCatalystAPIClient,
	getGlobalCatalystAPIClient,
} from '../../config';
import { addResourceEnvVars } from '../../env-util';
import { getDefaultBranch, isGitAvailable } from '../../git-helper';
import { fetchRegionsWithCache } from '../../regions';
import * as tui from '../../tui';
import { createPrompt } from '../../tui';
import type { AuthData, Config } from '../../types';
import {
	checkGithubRepo,
	createGithubRepo,
	getGithubBotIdentity,
	getGithubToken,
	linkProjectToRepo,
} from '../git/api';
import { initGitRepo } from './download';

// ─── Structured Errors ───

const RemoteImportInvalidURLError = StructuredError('RemoteImportInvalidURLError');
const RemoteImportUnsupportedHostError = StructuredError('RemoteImportUnsupportedHostError');
const RemoteImportDownloadError = StructuredError('RemoteImportDownloadError');
const RemoteImportExtractError = StructuredError('RemoteImportExtractError');
const RemoteImportNoOrganizationError = StructuredError(
	'RemoteImportNoOrganizationError',
	'No organizations found for your account'
);
const RemoteImportNoRegionError = StructuredError(
	'RemoteImportNoRegionError',
	'No cloud regions available'
);
const RemoteImportInvalidRepoError = StructuredError('RemoteImportInvalidRepoError');
const RemoteImportGitError = StructuredError('RemoteImportGitError');
const RemoteImportDeployError = StructuredError('RemoteImportDeployError');
const RemoteImportDirectoryNotFoundError = StructuredError('RemoteImportDirectoryNotFoundError');
const RemoteImportConfigError = StructuredError('RemoteImportConfigError');

export interface RemoteImportOptions {
	url: string;
	deploy: boolean;
	projectId?: string;
	repo?: string;
	name?: string;
	env?: string[];
	org?: string;
	region?: string;
	apiClient: APIClient;
	auth: AuthData;
	config: Config;
	logger: Logger;
}

interface ParsedGitHubUrl {
	owner: string;
	repo: string;
	branch: string;
	directory?: string;
}

/**
 * Sanitize a string by removing any embedded GitHub tokens from URLs.
 * Prevents token leakage in error messages and logs.
 */
function sanitizeTokens(msg: string): string {
	return msg.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
}

/**
 * Build GitHub API request headers, using the Agentuity-managed GitHub token
 * when available, falling back to the GITHUB_TOKEN env var.
 */
async function githubHeaders(apiClient: APIClient): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'Agentuity-CLI',
	};
	try {
		const { token } = await getGithubToken(apiClient);
		headers.Authorization = `Bearer ${token}`;
	} catch {
		// Fallback to GITHUB_TOKEN env var
		const githubToken = process.env.GITHUB_TOKEN;
		if (githubToken) {
			headers.Authorization = `Bearer ${githubToken}`;
		}
	}
	return headers;
}

/**
 * Fetch the default branch of a GitHub repository via the API.
 * Falls back to 'main' on any error.
 */
async function fetchDefaultBranch(
	owner: string,
	repo: string,
	apiClient: APIClient
): Promise<string> {
	try {
		const headers = await githubHeaders(apiClient);
		const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			headers,
		});
		if (!resp.ok) return 'main';
		const data = (await resp.json()) as { default_branch?: string };
		return data.default_branch ?? 'main';
	} catch {
		return 'main';
	}
}

/**
 * Parse a GitHub URL into its components.
 *
 * Supported formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/branch/path/to/dir
 *
 * When the URL does not include a branch (no `/tree/…` segment), the GitHub
 * API is queried to discover the repository's default branch.
 */
export async function parseGitHubUrl(url: string, apiClient: APIClient): Promise<ParsedGitHubUrl> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new RemoteImportInvalidURLError({ message: `Invalid URL: ${url}` });
	}

	if (parsed.hostname !== 'github.com') {
		throw new RemoteImportUnsupportedHostError({
			message: `Only GitHub URLs are supported. Got: ${parsed.hostname}`,
		});
	}

	// pathname is like /owner/repo or /owner/repo/tree/branch/path
	const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');

	if (parts.length < 2) {
		throw new RemoteImportInvalidURLError({
			message: `Invalid GitHub URL: expected at least owner/repo in path. Got: ${parsed.pathname}`,
		});
	}

	const owner = parts[0]!;
	// Strip .git suffix from repo name if present
	const repo = parts[1]!.replace(/\.git$/, '');

	let branch: string;
	let directory: string | undefined;

	// /owner/repo/tree/branch[/path/to/dir]
	if (parts.length >= 4 && parts[2] === 'tree') {
		branch = parts[3]!;
		if (parts.length > 4) {
			directory = parts.slice(4).join('/');
		}
	} else {
		// No branch in URL — ask GitHub for the repo's default branch
		branch = await fetchDefaultBranch(owner, repo, apiClient);
	}

	return { owner, repo, branch, directory };
}

/**
 * Download and extract a GitHub repository zipball to a temp directory.
 * Returns the path to the extracted content root.
 */
async function downloadAndExtract(
	parsed: ParsedGitHubUrl,
	apiClient: APIClient,
	logger: Logger
): Promise<{ extractDir: string; tempDir: string }> {
	const { owner, repo, branch } = parsed;
	const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

	logger.debug('[remote-import] Downloading zipball from: %s', zipUrl);

	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-remote-'));

	try {
		const zipPath = join(tempDir, 'download.zip');

		// Download the zipball
		const headers = await githubHeaders(apiClient);
		await tui.spinner({
			message: `Downloading ${owner}/${repo}...`,
			clearOnSuccess: true,
			callback: async () => {
				const resp = await fetch(zipUrl, {
					headers,
					redirect: 'follow',
				});

				if (!resp.ok) {
					throw new RemoteImportDownloadError({
						message: `Failed to download from GitHub: ${resp.status} ${resp.statusText}`,
					});
				}

				const buffer = Buffer.from(await resp.arrayBuffer());
				await Bun.write(zipPath, buffer);
				logger.debug('[remote-import] Downloaded %d bytes to %s', buffer.length, zipPath);

				return resp;
			},
		});

		// Extract the zip
		const extractDir = join(tempDir, 'extracted');
		mkdirSync(extractDir, { recursive: true });

		await tui.spinner({
			message: 'Extracting template...',
			clearOnSuccess: true,
			callback: async () => {
				// Use Bun's built-in unzip via subprocess
				const proc = Bun.spawnSync(['unzip', '-q', '-o', zipPath, '-d', extractDir], {
					stdout: 'pipe',
					stderr: 'pipe',
				});

				if (proc.exitCode !== 0) {
					const stderr = proc.stderr.toString();
					throw new RemoteImportExtractError({
						message: `Failed to extract zip: ${stderr}`,
					});
				}

				logger.debug('[remote-import] Extracted to %s', extractDir);
			},
		});

		// GitHub zipball creates a top-level directory like "owner-repo-sha/"
		// We need to find it and return its path
		const entries = readdirSync(extractDir);
		if (entries.length === 1 && entries[0]) {
			const innerDir = join(extractDir, entries[0]);
			return { extractDir: innerDir, tempDir };
		}

		return { extractDir, tempDir };
	} catch (err) {
		// Clean up temp directory on failure to prevent leaks
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		throw err;
	}
}

/**
 * Look for agentuity.yaml in the extracted content and parse it.
 * Returns the parsed content or null if not found.
 */
async function findAgentuityYaml(
	dir: string,
	logger: Logger
): Promise<Record<string, unknown> | null> {
	const yamlPath = join(dir, 'agentuity.yaml');
	const file = Bun.file(yamlPath);

	if (!(await file.exists())) {
		logger.debug('[remote-import] No agentuity.yaml found at %s', yamlPath);
		return null;
	}

	try {
		const { YAML } = await import('bun');
		const content = await file.text();
		const parsed = YAML.parse(content) as Record<string, unknown>;
		logger.debug('[remote-import] Parsed agentuity.yaml: %o', parsed);
		return parsed;
	} catch (err) {
		logger.debug('[remote-import] Failed to parse agentuity.yaml: %o', err);
		return null;
	}
}

/**
 * Create a project via the API in non-interactive mode using the provided name.
 */
async function createProjectNonInteractive(
	apiClient: APIClient,
	config: Config,
	logger: Logger,
	name: string,
	region?: string,
	orgOverride?: string
): Promise<{ id: string; sdkKey: string; orgId: string; region: string }> {
	// Fetch orgs — use the first one in non-interactive mode
	const orgs = await listOrganizations(apiClient);
	if (orgs.length === 0) {
		throw new RemoteImportNoOrganizationError();
	}

	const firstOrg = orgs[0];
	if (!firstOrg) {
		throw new RemoteImportNoOrganizationError();
	}

	const orgId = orgOverride ?? config.preferences?.orgId ?? firstOrg.id;

	// Determine region
	let selectedRegion = region;
	if (!selectedRegion) {
		selectedRegion = process.env.AGENTUITY_REGION ?? config.preferences?.region;
	}
	if (!selectedRegion) {
		const regions = await fetchRegionsWithCache(config.name, apiClient, logger);
		const firstRegion = regions[0];
		if (!firstRegion) {
			throw new RemoteImportNoRegionError();
		}
		selectedRegion = firstRegion.region;
	}

	const newProject = await tui.spinner({
		message: 'Creating project...',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name,
				orgId,
				cloudRegion: selectedRegion,
			});
		},
	});

	return {
		id: newProject.id,
		sdkKey: newProject.sdkKey,
		orgId,
		region: selectedRegion,
	};
}

/**
 * Create a project interactively — select org, region, name via TUI prompts.
 */
async function createProjectInteractive(
	apiClient: APIClient,
	config: Config,
	logger: Logger,
	defaultName?: string
): Promise<{ id: string; sdkKey: string; orgId: string; region: string }> {
	// Fetch orgs
	const orgs = await tui.spinner({
		message: 'Fetching organizations...',
		clearOnSuccess: true,
		callback: () => listOrganizations(apiClient),
	});

	if (orgs.length === 0) {
		throw new RemoteImportNoOrganizationError();
	}

	// Select org
	const orgId = await tui.selectOrganization(orgs, config.preferences?.orgId);

	// Fetch and select region
	const regions = await tui.spinner({
		message: 'Fetching regions...',
		clearOnSuccess: true,
		callback: () => fetchRegionsWithCache(config.name, apiClient, logger),
	});

	let selectedRegion: string;
	if (regions.length === 1 && regions[0]) {
		selectedRegion = regions[0].region;
	} else {
		const prompt = tui.createPrompt();
		const options = regions.map((r) => ({
			value: r.region,
			label: `${r.description} (${r.region})`,
		}));
		const firstOption = options[0];
		selectedRegion = await prompt.select({
			message: 'Select a region:',
			options,
			initial: firstOption?.value ?? '',
		});
	}

	// Get project name
	const prompt = tui.createPrompt();
	const projectName = await prompt.text({
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
		message: 'Registering project...',
		clearOnSuccess: true,
		callback: async () => {
			return projectCreate(apiClient, {
				name: projectName,
				orgId,
				cloudRegion: selectedRegion,
			});
		},
	});

	return {
		id: newProject.id,
		sdkKey: newProject.sdkKey,
		orgId,
		region: selectedRegion,
	};
}

/**
 * Parse a repo URL or "owner/name" string into owner and name components.
 * Supports:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - owner/repo
 */
function parseRepoTarget(repo: string): { owner: string; name: string } {
	// Try as a URL first
	try {
		const parsed = new URL(repo);
		if (parsed.hostname === 'github.com') {
			const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
			if (parts.length >= 2 && parts[0] && parts[1]) {
				return { owner: parts[0], name: parts[1].replace(/\.git$/, '') };
			}
		}
	} catch {
		// Not a URL — try "owner/name" format
	}

	const parts = repo.split('/');
	if (parts.length === 2 && parts[0] && parts[1]) {
		return { owner: parts[0], name: parts[1].replace(/\.git$/, '') };
	}

	throw new RemoteImportInvalidRepoError({
		message: `Invalid repo target: "${repo}". Expected a GitHub URL (https://github.com/owner/repo) or owner/repo format.`,
	});
}

/**
 * Create a GitHub repo via the API. Preflight check already verified it doesn't exist.
 * Returns the HTTPS URL of the repo.
 */
async function createGithubRepoForImport(
	apiClient: APIClient,
	repo: string,
	_logger: Logger
): Promise<string> {
	const { owner, name } = parseRepoTarget(repo);

	const createResult = await tui.spinner({
		message: `Creating repository ${owner}/${name}...`,
		clearOnSuccess: true,
		callback: () =>
			createGithubRepo(apiClient, {
				name,
				owner,
				private: true,
			}),
	});

	tui.success(`Created repository ${createResult.fullName}`);
	return createResult.url;
}

/**
 * Push the working directory to a remote git repository.
 */
async function pushToRepo(
	dest: string,
	repoUrl: string,
	apiClient: APIClient,
	logger: Logger
): Promise<void> {
	const gitAvailable = await isGitAvailable();
	if (!gitAvailable) {
		tui.warning('Git is not available — skipping git push.');
		return;
	}

	const defaultBranch = (await getDefaultBranch()) || 'main';

	// Get GitHub token from Agentuity API (uses stored OAuth token)
	let remoteUrl = repoUrl;
	try {
		const { token } = await getGithubToken(apiClient);
		const parsed = new URL(repoUrl);
		if (parsed.hostname === 'github.com') {
			remoteUrl = `https://x-access-token:${token}@github.com${parsed.pathname}`;
			if (!remoteUrl.endsWith('.git')) {
				remoteUrl += '.git';
			}
		}
	} catch (err) {
		logger.debug(
			'[remote-import] Could not get GitHub token from API, trying without auth: %o',
			err
		);
		// Fall through — push will likely fail for private repos but may work for public
	}

	await tui.spinner({
		message: 'Pushing to remote repository...',
		clearOnSuccess: true,
		callback: async () => {
			// Add remote origin
			const addRemote = Bun.spawnSync(['git', 'remote', 'add', 'origin', remoteUrl], {
				cwd: dest,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			if (addRemote.exitCode !== 0) {
				// Remote might already exist, try set-url instead
				const setUrl = Bun.spawnSync(['git', 'remote', 'set-url', 'origin', remoteUrl], {
					cwd: dest,
					stdout: 'pipe',
					stderr: 'pipe',
				});
				if (setUrl.exitCode !== 0) {
					throw new RemoteImportGitError({
						message: `Failed to set git remote: ${sanitizeTokens(setUrl.stderr.toString())}`,
					});
				}
			}

			// Push to remote
			const push = Bun.spawnSync(['git', 'push', '-u', 'origin', defaultBranch], {
				cwd: dest,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			if (push.exitCode !== 0) {
				throw new RemoteImportGitError({
					message: `Failed to push to remote: ${sanitizeTokens(push.stderr.toString())}`,
				});
			}

			logger.debug('[remote-import] Pushed to %s on branch %s', repoUrl, defaultBranch);
		},
	});

	tui.success(`Pushed to ${repoUrl}`);
}

/**
 * Run the deploy command as a subprocess.
 *
 * Uses `bunx agentuity deploy …` to match the fork-wrapper pattern used
 * elsewhere in the CLI (see deploy-fork.ts). This avoids relying on
 * `agentuity` being independently available on PATH.
 */
async function runDeploy(dest: string, logger: Logger): Promise<void> {
	tui.info('Deploying project...');

	const args = ['bunx', 'agentuity', 'deploy', '--trigger', 'cli', '--event', 'manual'];

	logger.debug('[remote-import] Running deploy: %s', args.join(' '));

	const proc = Bun.spawn(args, {
		cwd: dest,
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...process.env,
		},
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new RemoteImportDeployError({
			message: `Deploy failed with exit code ${exitCode}`,
		});
	}
}

/**
 * Run the remote import flow: download from GitHub, set up project, optionally push and deploy.
 */
export async function runRemoteImport(options: RemoteImportOptions): Promise<void> {
	const {
		url,
		deploy,
		projectId,
		repo,
		name,
		env,
		org,
		region: optRegion,
		apiClient,
		auth,
		config,
		logger,
	} = options;

	// Safety check: refuse to run inside an existing git repo
	try {
		const result = Bun.spawnSync(['git', 'rev-parse', '--is-inside-work-tree'], {
			cwd: process.cwd(),
			stdout: 'pipe',
			stderr: 'pipe',
		});
		if (result.exitCode === 0 && result.stdout.toString().trim() === 'true') {
			tui.fatal(
				'Cannot run remote import inside an existing git repository. Please run from an empty directory.'
			);
		}
	} catch {
		// git not found or command failed — not inside a repo, which is fine
	}

	// 1. Parse GitHub URL (async — may query GitHub API for default branch)
	const parsed = await parseGitHubUrl(url, apiClient);
	logger.debug(
		'[remote-import] Parsed URL: owner=%s repo=%s branch=%s dir=%s',
		parsed.owner,
		parsed.repo,
		parsed.branch,
		parsed.directory ?? '(root)'
	);

	// ── Preflight checks (all before any mutations) ──

	// Check: target directory doesn't already exist
	const projectDirName = name ?? parsed.repo;
	const dest = join(process.cwd(), projectDirName);
	if (existsSync(dest)) {
		tui.fatal(`Directory "${projectDirName}" already exists. Choose a different name with --name.`);
	}

	// Check: target GitHub repo doesn't already exist
	if (repo) {
		const { owner: repoOwner, name: repoName } = parseRepoTarget(repo);
		const checkResult = await tui.spinner({
			message: `Checking repository ${repoOwner}/${repoName}...`,
			clearOnSuccess: true,
			callback: () => checkGithubRepo(apiClient, { owner: repoOwner, name: repoName }),
		});
		if (checkResult.exists) {
			tui.fatal(
				`Repository ${repoOwner}/${repoName} already exists. Use a different name or delete the existing repo first.`
			);
		}
	}

	// ── All checks passed — start doing work ──

	// 2. Download and extract template source
	let tempDir: string | undefined;
	let sourceDir: string;

	try {
		const result = await downloadAndExtract(parsed, apiClient, logger);
		tempDir = result.tempDir;
		sourceDir = result.extractDir;

		// If a specific directory was specified in the URL, navigate into it
		if (parsed.directory) {
			const subDir = join(sourceDir, parsed.directory);
			if (!existsSync(subDir)) {
				throw new RemoteImportDirectoryNotFoundError({
					message: `Directory "${parsed.directory}" not found in the repository.`,
				});
			}
			sourceDir = subDir;
		}

		// 3. Find and parse agentuity.yaml (informational, for future use)
		const yamlConfig = await findAgentuityYaml(sourceDir, logger);
		if (yamlConfig) {
			tui.info('Found agentuity.yaml in template.');
		}

		// 4. Project setup
		let projectInfo: {
			id: string;
			sdkKey: string;
			orgId: string;
			region: string;
		};

		if (projectId) {
			// --project-id was provided: skip creation, just write config
			const sdkKey = process.env.AGENTUITY_SDK_KEY;
			if (!sdkKey) {
				throw new RemoteImportConfigError({
					message: 'AGENTUITY_SDK_KEY environment variable is required when using --project-id',
				});
			}
			const orgId = org ?? config.preferences?.orgId;
			if (!orgId) {
				throw new RemoteImportConfigError({
					message:
						'Organization ID not found. Use --org flag, set orgId in config preferences, or use interactive mode.',
				});
			}
			const region = process.env.AGENTUITY_REGION ?? config.preferences?.region ?? 'usc';

			projectInfo = { id: projectId, sdkKey, orgId, region };
			tui.info(`Using pre-created project: ${projectId}`);
		} else if (name) {
			// --name provided: create non-interactively (headless-friendly)
			projectInfo = await createProjectNonInteractive(
				apiClient,
				config,
				logger,
				name,
				optRegion,
				org
			);
		} else if (isTTY()) {
			// Interactive mode: prompt for org/region/name
			projectInfo = await createProjectInteractive(apiClient, config, logger, parsed.repo);
		} else {
			// Non-interactive without --name: use repo name
			projectInfo = await createProjectNonInteractive(
				apiClient,
				config,
				logger,
				parsed.repo,
				optRegion,
				org
			);
		}

		// Parse .env.example to detect required env vars and resources
		// Platform-managed vars that should not appear in requirements
		const platformManagedVars = new Set([
			'AGENTUITY_SDK_KEY',
			'AGENTUITY_URL',
			'AGENTUITY_TRANSPORT_URL',
			'AGENTUITY_BEARER_TOKEN',
			'NODE_ENV',
		]);

		type TemplateConfig = {
			source?: string;
			requirements?: {
				resources?: Array<{
					type: 'database' | 'queue';
					envVar: string;
					description?: string;
					defaultName?: string;
					queueType?: 'worker' | 'pubsub';
				}>;
				env?: Array<{ key: string; required: boolean; description?: string }>;
			};
		};

		let template: TemplateConfig | undefined;
		const envExamplePath = join(sourceDir, '.env.example');
		if (await Bun.file(envExamplePath).exists()) {
			try {
				const envContent = await Bun.file(envExamplePath).text();
				const envFields = parseEnvExample(envContent).filter(
					(f) => !platformManagedVars.has(f.key)
				);

				const resources: NonNullable<NonNullable<TemplateConfig['requirements']>['resources']> =
					envFields
						.filter((f) => f.resource)
						.map((f) => ({
							type: f.resource!,
							envVar: f.key,
							description: f.comment,
						}));

				const envVars = envFields
					.filter((f) => !f.resource)
					.map((f) => ({
						key: f.key,
						required: f.required ?? false,
						description: f.comment,
					}));

				// Merge curated metadata from the source template's existing agentuity.json
				const existingConfigPath = join(sourceDir, 'agentuity.json');
				if (await Bun.file(existingConfigPath).exists()) {
					try {
						const existingConfig = JSON.parse(await Bun.file(existingConfigPath).text());
						const existingResources = existingConfig?.template?.requirements?.resources;
						if (Array.isArray(existingResources)) {
							// Merge extra fields (like defaultName) from curated config
							for (const resource of resources) {
								const curated = existingResources.find(
									(r: { envVar?: string }) => r.envVar === resource.envVar
								);
								if (curated?.defaultName) {
									resource.defaultName = curated.defaultName;
								}
								if (curated?.queueType) {
									resource.queueType = curated.queueType;
								}
							}
							// Preserve curated resources NOT detected by parser
							for (const curated of existingResources) {
								if (!resources.some((r) => r.envVar === curated.envVar)) {
									resources.push(curated);
								}
							}
						}

						// Merge curated env vars not detected by parser
						const existingEnv = existingConfig?.template?.requirements?.env;
						if (Array.isArray(existingEnv)) {
							for (const curated of existingEnv) {
								if (!envVars.some((e) => e.key === curated.key)) {
									envVars.push(curated);
								}
							}
						}
					} catch {
						// Ignore parse errors — source config may be malformed
					}
				}

				if (resources.length > 0 || envVars.length > 0) {
					template = {
						source: `github.com/${parsed.owner}/${parsed.repo}`,
						requirements: {
							resources: resources.length > 0 ? resources : undefined,
							env: envVars.length > 0 ? envVars : undefined,
						},
					};

					for (const r of resources) {
						tui.info(
							`Requires ${r.type}: ${r.envVar}${r.description ? ` (${r.description})` : ''}`
						);
					}
					const requiredEnv = envVars.filter((f) => f.required);
					for (const f of requiredEnv) {
						tui.info(`Required env var: ${f.key}${f.description ? ` (${f.description})` : ''}`);
					}
				}
			} catch (err) {
				logger.debug('[remote-import] Could not parse .env.example: %o', err);
			}
		}

		// If no .env.example but we know the source, still track it
		if (!template && parsed.owner && parsed.repo) {
			template = { source: `github.com/${parsed.owner}/${parsed.repo}` };
		}

		// ─── Resource Provisioning ───

		// Parse --env flags into a map
		const envOverrides = new Map<string, string>();
		for (const e of env ?? []) {
			const colonIdx = e.indexOf(':');
			if (colonIdx > 0) {
				envOverrides.set(e.slice(0, colonIdx), e.slice(colonIdx + 1));
			}
		}

		const resourceEnvVars: Record<string, string> = {};
		const interactive = isTTY();
		const templateResources = template?.requirements?.resources ?? [];
		const templateEnvVars = template?.requirements?.env ?? [];

		// Check if we can provision (need auth + org + region)
		const orgId = projectInfo.orgId;
		const region = projectInfo.region;
		const canProvision = !!orgId && !!region;

		if (canProvision && (templateResources.length > 0 || templateEnvVars.length > 0)) {
			// ── Preflight validation: check all required items before creating anything ──
			if (!interactive) {
				const missing: string[] = [];

				for (const r of templateResources) {
					if (!envOverrides.has(r.envVar)) {
						missing.push(`--env ${r.envVar}:<${r.type}-name>`);
					}
				}

				for (const e of templateEnvVars) {
					if (e.required && !envOverrides.has(e.key)) {
						missing.push(`--env ${e.key}:<value>`);
					}
				}

				if (missing.length > 0) {
					for (const m of missing) {
						tui.error(`Missing: ${m}`);
					}
					tui.fatal('Provide all required --env flags for non-interactive mode.');
				}

				// Validate database names upfront
				for (const r of templateResources.filter((res) => res.type === 'database')) {
					const name = envOverrides.get(r.envVar)!;
					const validation = validateDatabaseName(name);
					if (!validation.valid) {
						tui.fatal(`Invalid database name "${name}" for ${r.envVar}: ${validation.error}`);
					}
				}
			}

			const catalystClient = getCatalystAPIClient(logger, auth, region);

			// ── Database Resources ──
			for (const r of templateResources.filter((resource) => resource.type === 'database')) {
				const overrideName = envOverrides.get(r.envVar);

				if (overrideName) {
					// Non-interactive path: create DB with the given name
					try {
						const validation = validateDatabaseName(overrideName);
						if (!validation.valid) {
							throw new RemoteImportConfigError({
								message: `Invalid database name "${overrideName}": ${validation.error}`,
							});
						}
						const created = await tui.spinner({
							message: `Creating database "${overrideName}"`,
							clearOnSuccess: true,
							callback: () =>
								createResources(catalystClient, orgId, region, [
									{ type: 'db', name: overrideName, description: r.description },
								]),
						});
						if (created[0]?.env) {
							// Map using the template-defined envVar name
							const connStr = created[0].env.DATABASE_URL ?? Object.values(created[0].env)[0];
							if (connStr) resourceEnvVars[r.envVar] = connStr;
						}
						tui.success(`Created database: ${overrideName}`);
					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : String(err);
						if (!interactive) {
							throw new RemoteImportConfigError({
								message: `Failed to create database "${overrideName}": ${msg}`,
							});
						}
						tui.error(`Failed to create database "${overrideName}": ${msg}`);
						// Fall through to interactive prompt below
					}
				}

				// Interactive fallback (no --env or --env failed)
				if (!resourceEnvVars[r.envVar] && interactive) {
					const prompt = createPrompt();
					let existingDbs: Awaited<ReturnType<typeof listResources>> | undefined;
					try {
						existingDbs = await tui.spinner({
							message: 'Fetching existing databases',
							clearOnSuccess: true,
							callback: () => listResources(catalystClient, orgId, region),
						});
					} catch {
						// Ignore — just won't show existing options
					}

					let dbCreated = false;
					while (!dbCreated) {
						const action = await prompt.select({
							message: `${r.description || r.envVar} requires a database`,
							options: [
								{ value: 'skip', label: 'Skip — set up later' },
								{ value: 'create', label: 'Create a new database' },
								...(existingDbs?.db ?? []).map((db) => ({
									value: `existing:${db.name}`,
									label: `Use existing: ${tui.tuiColors.primary(db.name)}`,
								})),
							],
						});

						if (action === 'skip') break;

						if (action === 'create') {
							const dbName = await prompt.text({
								message: 'Database name',
								hint: 'Lowercase letters, digits, underscores only',
								initial: r.defaultName,
								validate: (value: string) => {
									const trimmed = value.trim();
									if (trimmed === '') return 'Name is required';
									const result = validateDatabaseName(trimmed);
									return result.valid ? true : result.error!;
								},
							});
							try {
								const created = await tui.spinner({
									message: `Creating database "${dbName}"`,
									clearOnSuccess: true,
									callback: () =>
										createResources(catalystClient, orgId, region, [
											{ type: 'db', name: dbName.trim(), description: r.description },
										]),
								});
								if (created[0]?.env) {
									const connStr = created[0].env.DATABASE_URL ?? Object.values(created[0].env)[0];
									if (connStr) resourceEnvVars[r.envVar] = connStr;
								}
								tui.success(`Created database: ${dbName}`);
								dbCreated = true;
							} catch (err: unknown) {
								tui.error(
									`Failed to create database: ${err instanceof Error ? err.message : String(err)}`
								);
								// Loop back to prompt
							}
						} else if (action.startsWith('existing:')) {
							const selectedName = action.slice('existing:'.length);
							const selectedDb = existingDbs?.db.find((d) => d.name === selectedName);
							if (selectedDb?.env) {
								const connStr = selectedDb.env.DATABASE_URL ?? Object.values(selectedDb.env)[0];
								if (connStr) resourceEnvVars[r.envVar] = connStr;
							}
							dbCreated = true;
						}
					}
				}

				if (!resourceEnvVars[r.envVar] && !interactive) {
					throw new RemoteImportConfigError({
						message: `Missing required database for ${r.envVar}. Pass --env ${r.envVar}:<db-name> to provision.`,
					});
				}
			}

			// ── Queue Resources ──
			const queueClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);
			const queueOrgOpts = orgId ? { orgId } : undefined;

			for (const r of templateResources.filter((resource) => resource.type === 'queue')) {
				if (!r.queueType) {
					logger.debug('[remote-import] Queue resource %s missing queueType, skipping', r.envVar);
					continue;
				}

				const overrideName = envOverrides.get(r.envVar);

				if (overrideName) {
					// Non-interactive path: create queue with given name
					try {
						const queue = await tui.spinner({
							message: `Creating ${r.queueType} queue "${overrideName}"`,
							clearOnSuccess: true,
							callback: () =>
								createQueue(
									queueClient,
									{
										name: overrideName,
										queue_type: r.queueType!,
										description: r.description,
									},
									queueOrgOpts
								),
						});
						resourceEnvVars[r.envVar] = queue.name;
						tui.success(`Created queue: ${queue.name}`);
					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : String(err);
						if (!interactive) {
							throw new RemoteImportConfigError({
								message: `Failed to create queue "${overrideName}": ${msg}`,
							});
						}
						tui.error(`Failed to create queue "${overrideName}": ${msg}`);
					}
				}

				// Interactive fallback
				if (!resourceEnvVars[r.envVar] && interactive) {
					const prompt = createPrompt();
					let existingQueues: Awaited<ReturnType<typeof listQueues>> | undefined;
					try {
						existingQueues = await tui.spinner({
							message: 'Fetching existing queues',
							clearOnSuccess: true,
							callback: () => listQueues(queueClient, {}, queueOrgOpts),
						});
					} catch {
						// Ignore
					}

					let queueCreated = false;
					while (!queueCreated) {
						const action = await prompt.select({
							message: `${r.description || r.envVar} requires a ${r.queueType} queue`,
							options: [
								{ value: 'skip', label: 'Skip — set up later' },
								{ value: 'create', label: `Create a new ${r.queueType} queue` },
								...(existingQueues?.queues ?? []).map((q) => ({
									value: `existing:${q.name}`,
									label: `Use existing: ${tui.tuiColors.primary(q.name)}`,
								})),
							],
						});

						if (action === 'skip') break;

						if (action === 'create') {
							const queueName = await prompt.text({
								message: 'Queue name',
								hint: 'Optional — auto-generated if empty',
								initial: r.defaultName,
							});
							try {
								const queue = await tui.spinner({
									message: `Creating ${r.queueType} queue "${queueName || '(auto)'}"`,
									clearOnSuccess: true,
									callback: () =>
										createQueue(
											queueClient,
											{
												name: queueName.trim() || undefined,
												queue_type: r.queueType!,
												description: r.description,
											},
											queueOrgOpts
										),
								});
								resourceEnvVars[r.envVar] = queue.name;
								tui.success(`Created queue: ${queue.name}`);
								queueCreated = true;
							} catch (err: unknown) {
								tui.error(
									`Failed to create queue: ${err instanceof Error ? err.message : String(err)}`
								);
							}
						} else if (action.startsWith('existing:')) {
							const selectedName = action.slice('existing:'.length);
							resourceEnvVars[r.envVar] = selectedName;
							queueCreated = true;
						}
					}
				}

				if (!resourceEnvVars[r.envVar] && !interactive) {
					throw new RemoteImportConfigError({
						message: `Missing required queue for ${r.envVar}. Pass --env ${r.envVar}:<queue-name> to provision.`,
					});
				}
			}

			// ── Plain Env Vars ──
			for (const e of templateEnvVars) {
				if (envOverrides.has(e.key)) {
					resourceEnvVars[e.key] = envOverrides.get(e.key)!;
				} else if (e.required) {
					if (interactive) {
						const prompt = createPrompt();
						const val = await prompt.text({
							message: `Enter value for ${e.key}${e.description ? ` (${e.description})` : ''}`,
						});
						if (val.trim()) {
							resourceEnvVars[e.key] = val.trim();
						}
					} else {
						throw new RemoteImportConfigError({
							message: `Missing required env var ${e.key}. Pass --env ${e.key}:<value> to set it.`,
						});
					}
				}
			}

			// Write all collected env vars to .env
			if (Object.keys(resourceEnvVars).length > 0) {
				await addResourceEnvVars(sourceDir, resourceEnvVars);
				tui.success(`Configured ${Object.keys(resourceEnvVars).length} environment variable(s)`);
			}
		}

		// Write agentuity.json and .env to sourceDir so git commit includes them
		await createProjectConfig(sourceDir, {
			projectId: projectInfo.id,
			orgId: projectInfo.orgId,
			sdkKey: projectInfo.sdkKey,
			region: projectInfo.region,
			template,
		});
		tui.success('Created agentuity.json');

		// Ensure .env is gitignored before any git operations (prevents secret leak)
		const gitignorePath = join(sourceDir, '.gitignore');
		const gitignoreFile = Bun.file(gitignorePath);
		if (await gitignoreFile.exists()) {
			const gitignoreContent = await gitignoreFile.text();
			const lines = gitignoreContent.split('\n').map((l) => l.trim());
			if (!lines.includes('.env')) {
				await Bun.write(gitignorePath, `${gitignoreContent.trimEnd()}\n.env\n`);
			}
		} else {
			await Bun.write(gitignorePath, '.env\n.env.*\n');
		}

		// Update package.json name to match the project name
		const pkgJsonPath = join(sourceDir, 'package.json');
		if (await Bun.file(pkgJsonPath).exists()) {
			try {
				const pkgRaw = await Bun.file(pkgJsonPath).text();
				const pkg = JSON.parse(pkgRaw);
				pkg.name = projectDirName;
				await Bun.write(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
				logger.debug('[remote-import] Updated package.json name to %s', projectDirName);
			} catch (err) {
				logger.debug('[remote-import] Could not update package.json name: %o', err);
			}
		}

		// Fetch GitHub App bot identity for commit authorship
		let botAuthor: { name: string; email: string } | undefined;
		try {
			botAuthor = await getGithubBotIdentity(apiClient);
		} catch {
			logger.debug('[remote-import] Could not fetch bot identity, using fallback');
		}

		// 5. Git init + push (if --repo flag provided) — in sourceDir, not CWD
		if (repo) {
			// Create the repo (we already verified it doesn't exist in preflight)
			const repoUrl = await createGithubRepoForImport(apiClient, repo, logger);

			// Initialize git repo in sourceDir (handles init + first commit)
			await initGitRepo(sourceDir, {
				projectName: projectDirName,
				source: `github.com/${parsed.owner}/${parsed.repo}`,
				author: botAuthor,
			});

			// Push to remote from sourceDir
			await pushToRepo(sourceDir, repoUrl, apiClient, logger);
			tui.success(`GitHub repo: ${repoUrl}`);

			// Link the repo to the Agentuity project (enables auto-deploy + preview deploys)
			try {
				const { owner: linkOwner, name: linkName } = parseRepoTarget(repo);
				const pushedBranch = (await getDefaultBranch()) || 'main';
				await linkProjectToRepo(apiClient, {
					projectId: projectInfo.id,
					repoFullName: `${linkOwner}/${linkName}`,
					branch: pushedBranch,
					autoDeploy: true,
					previewDeploy: true,
					directory: parsed.directory,
				});
				tui.success('Linked repo to project');
			} catch (err) {
				logger.debug('[remote-import] Failed to link repo to project: %o', err);
				tui.warning('Could not link repo to project — you can link manually with `agentuity link`');
			}
		}

		// 6. Copy extracted content into project folder (already validated in preflight)
		await tui.spinner({
			message: 'Copying project files...',
			clearOnSuccess: true,
			callback: async () => {
				mkdirSync(dest, { recursive: true });
				const entries = readdirSync(sourceDir);
				for (const entry of entries) {
					cpSync(join(sourceDir, entry), join(dest, entry), {
						recursive: true,
					});
				}
			},
		});

		// Reset git remote to clean URL (pushToRepo may have embedded a token)
		if (repo) {
			const { owner, name: repoName } = parseRepoTarget(repo);
			const cleanUrl = `https://github.com/${owner}/${repoName}.git`;
			Bun.spawnSync(['git', 'remote', 'set-url', 'origin', cleanUrl], {
				cwd: dest,
				stdout: 'pipe',
				stderr: 'pipe',
			});
		}

		tui.success(`Project created in ./${projectDirName}`);

		// 7. Deploy (if --deploy flag)
		if (deploy) {
			await runDeploy(dest, logger);
		}

		tui.success('Remote import completed successfully!');
	} finally {
		// Clean up temp directory
		if (tempDir) {
			try {
				rmSync(tempDir, { recursive: true, force: true });
				logger.debug('[remote-import] Cleaned up temp dir: %s', tempDir);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}
