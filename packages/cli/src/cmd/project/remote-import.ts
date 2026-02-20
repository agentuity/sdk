import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { listOrganizations, projectCreate } from '@agentuity/server';
import type { APIClient } from '../../api';
import { isTTY } from '../../auth';
import { createProjectConfig } from '../../config';
import { getDefaultBranch, isGitAvailable } from '../../git-helper';
import { fetchRegionsWithCache } from '../../regions';
import * as tui from '../../tui';
import type { AuthData, Config } from '../../types';
import { initGitRepo } from './download';

export interface RemoteImportOptions {
	url: string;
	deploy: boolean;
	projectId?: string;
	repo?: string;
	name?: string;
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
 * Build GitHub API request headers, optionally including GITHUB_TOKEN auth.
 */
function githubHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'Agentuity-CLI',
	};
	const githubToken = process.env.GITHUB_TOKEN;
	if (githubToken) {
		headers.Authorization = `Bearer ${githubToken}`;
	}
	return headers;
}

/**
 * Fetch the default branch of a GitHub repository via the API.
 * Falls back to 'main' on any error.
 */
async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
	try {
		const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			headers: githubHeaders(),
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
export async function parseGitHubUrl(url: string): Promise<ParsedGitHubUrl> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	if (parsed.hostname !== 'github.com') {
		throw new Error(`Only GitHub URLs are supported. Got: ${parsed.hostname}`);
	}

	// pathname is like /owner/repo or /owner/repo/tree/branch/path
	const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');

	if (parts.length < 2) {
		throw new Error(
			`Invalid GitHub URL: expected at least owner/repo in path. Got: ${parsed.pathname}`
		);
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
		branch = await fetchDefaultBranch(owner, repo);
	}

	return { owner, repo, branch, directory };
}

/**
 * Download and extract a GitHub repository zipball to a temp directory.
 * Returns the path to the extracted content root.
 */
async function downloadAndExtract(
	parsed: ParsedGitHubUrl,
	logger: Logger
): Promise<{ extractDir: string; tempDir: string }> {
	const { owner, repo, branch } = parsed;
	const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

	logger.debug('[remote-import] Downloading zipball from: %s', zipUrl);

	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-remote-'));
	const zipPath = join(tempDir, 'download.zip');

	// Download the zipball
	const response = await tui.spinner({
		message: `Downloading ${owner}/${repo}...`,
		clearOnSuccess: true,
		callback: async () => {
			const headers: Record<string, string> = {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'Agentuity-CLI',
			};

			// Use GITHUB_TOKEN if available for rate limiting / private repos
			const githubToken = process.env.GITHUB_TOKEN;
			if (githubToken) {
				headers.Authorization = `Bearer ${githubToken}`;
			}

			const resp = await fetch(zipUrl, {
				headers,
				redirect: 'follow',
			});

			if (!resp.ok) {
				throw new Error(`Failed to download from GitHub: ${resp.status} ${resp.statusText}`);
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
				throw new Error(`Failed to extract zip: ${stderr}`);
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
	region?: string
): Promise<{ id: string; sdkKey: string; orgId: string; region: string }> {
	// Fetch orgs — use the first one in non-interactive mode
	const orgs = await listOrganizations(apiClient);
	if (orgs.length === 0) {
		throw new Error('No organizations found for your account.');
	}

	const firstOrg = orgs[0];
	if (!firstOrg) {
		throw new Error('No organizations found for your account.');
	}

	const orgId = config.preferences?.orgId ?? firstOrg.id;

	// Determine region
	let selectedRegion = region;
	if (!selectedRegion) {
		selectedRegion = process.env.AGENTUITY_REGION ?? config.preferences?.region;
	}
	if (!selectedRegion) {
		const regions = await fetchRegionsWithCache(config.name, apiClient, logger);
		const firstRegion = regions[0];
		if (!firstRegion) {
			throw new Error('No cloud regions available.');
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

	return { id: newProject.id, sdkKey: newProject.sdkKey, orgId, region: selectedRegion };
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
		throw new Error('No organizations found for your account.');
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

	return { id: newProject.id, sdkKey: newProject.sdkKey, orgId, region: selectedRegion };
}

/**
 * Push the working directory to a remote git repository.
 */
async function pushToRepo(dest: string, repoUrl: string, logger: Logger): Promise<void> {
	const gitAvailable = await isGitAvailable();
	if (!gitAvailable) {
		tui.warning('Git is not available — skipping git push.');
		return;
	}

	const defaultBranch = (await getDefaultBranch()) || 'main';

	// Determine the actual remote URL, rewriting for token auth if available
	let remoteUrl = repoUrl;
	const githubToken = process.env.GITHUB_TOKEN;
	if (githubToken) {
		try {
			const parsed = new URL(repoUrl);
			if (parsed.hostname === 'github.com') {
				remoteUrl = `https://x-access-token:${githubToken}@github.com${parsed.pathname}`;
				if (!remoteUrl.endsWith('.git')) {
					remoteUrl += '.git';
				}
			}
		} catch {
			// If URL parsing fails, use as-is
			logger.debug('[remote-import] Could not parse repo URL for token rewrite: %s', repoUrl);
		}
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
					throw new Error(`Failed to set git remote: ${sanitizeTokens(setUrl.stderr.toString())}`);
				}
			}

			// Push to remote
			const push = Bun.spawnSync(['git', 'push', '-u', 'origin', defaultBranch], {
				cwd: dest,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			if (push.exitCode !== 0) {
				throw new Error(`Failed to push to remote: ${sanitizeTokens(push.stderr.toString())}`);
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
		throw new Error(`Deploy failed with exit code ${exitCode}`);
	}
}

/**
 * Run the remote import flow: download from GitHub, set up project, optionally push and deploy.
 */
export async function runRemoteImport(options: RemoteImportOptions): Promise<void> {
	const { url, deploy, projectId, repo, name, apiClient, auth, config, logger } = options;

	// 1. Parse GitHub URL (async — may query GitHub API for default branch)
	const parsed = await parseGitHubUrl(url);
	logger.debug(
		'[remote-import] Parsed URL: owner=%s repo=%s branch=%s dir=%s',
		parsed.owner,
		parsed.repo,
		parsed.branch,
		parsed.directory ?? '(root)'
	);

	// 2. Download and extract template source
	let tempDir: string | undefined;
	let sourceDir: string;

	try {
		const result = await downloadAndExtract(parsed, logger);
		tempDir = result.tempDir;
		sourceDir = result.extractDir;

		// If a specific directory was specified in the URL, navigate into it
		if (parsed.directory) {
			const subDir = join(sourceDir, parsed.directory);
			if (!existsSync(subDir)) {
				throw new Error(`Directory "${parsed.directory}" not found in the repository.`);
			}
			sourceDir = subDir;
		}

		// 3. Find and parse agentuity.yaml (informational, for future use)
		const yamlConfig = await findAgentuityYaml(sourceDir, logger);
		if (yamlConfig) {
			tui.info('Found agentuity.yaml in template.');
		}

		// 4. Copy extracted content to working directory (current directory)
		const dest = process.cwd();

		await tui.spinner({
			message: 'Copying project files...',
			clearOnSuccess: true,
			callback: async () => {
				const entries = readdirSync(sourceDir);
				for (const entry of entries) {
					cpSync(join(sourceDir, entry), join(dest, entry), { recursive: true });
				}
			},
		});

		// 5. Project setup
		let projectInfo: { id: string; sdkKey: string; orgId: string; region: string };

		if (projectId) {
			// --project-id was provided: skip creation, just write config
			const sdkKey = process.env.AGENTUITY_SDK_KEY;
			if (!sdkKey) {
				throw new Error(
					'AGENTUITY_SDK_KEY environment variable is required when using --project-id'
				);
			}
			const orgId = config.preferences?.orgId;
			if (!orgId) {
				throw new Error(
					'Organization ID not found. Set orgId in config preferences or use interactive mode.'
				);
			}
			const region = process.env.AGENTUITY_REGION ?? config.preferences?.region ?? 'usc';

			projectInfo = { id: projectId, sdkKey, orgId, region };
			tui.info(`Using pre-created project: ${projectId}`);
		} else if (isTTY()) {
			// Interactive mode: prompt for org/region/name
			const defaultName = name ?? parsed.repo;
			projectInfo = await createProjectInteractive(apiClient, config, logger, defaultName);
		} else if (name) {
			// Non-interactive with --name: create via API
			projectInfo = await createProjectNonInteractive(apiClient, config, logger, name);
		} else {
			// Non-interactive without --name: use repo name
			projectInfo = await createProjectNonInteractive(apiClient, config, logger, parsed.repo);
		}

		// Write agentuity.json and .env
		await createProjectConfig(dest, {
			projectId: projectInfo.id,
			orgId: projectInfo.orgId,
			sdkKey: projectInfo.sdkKey,
			region: projectInfo.region,
		});
		tui.success('Created agentuity.json');

		// 6. Git init + push (if --repo flag provided)
		if (repo) {
			// Initialize git repo (handles init + first commit)
			await initGitRepo(dest);

			// Push to remote
			await pushToRepo(dest, repo, logger);
		}

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
