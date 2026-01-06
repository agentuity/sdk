import { createSubcommand, type Config } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import enquirer from 'enquirer';
import { z } from 'zod';
import {
	getGithubIntegrationStatus,
	listGithubRepos,
	linkProjectToRepo,
	getProjectGithubStatus,
	type GithubRepo,
} from '../integration/api';
import type { APIClient } from '../../api';
import type { Logger } from '@agentuity/core';
import { runGitAccountConnect } from './account/add';

export interface DetectedGitInfo {
	repo: string | null;
	branch: string | null;
}

export function detectGitInfo(): DetectedGitInfo {
	let repo: string | null = null;
	let branch: string | null = null;

	try {
		// Detect repo from origin remote
		const remoteResult = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		if (remoteResult.exitCode === 0) {
			const url = remoteResult.stdout.toString().trim();
			// Parse GitHub URL formats:
			// https://github.com/owner/repo.git
			// git@github.com:owner/repo.git
			const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
			if (httpsMatch) repo = httpsMatch[1];

			const sshMatch = url.match(/github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
			if (sshMatch) repo = sshMatch[1];
		}

		// Detect current branch
		const branchResult = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		if (branchResult.exitCode === 0) {
			branch = branchResult.stdout.toString().trim();
		}
	} catch {
		// Ignore errors
	}

	return { repo, branch };
}

export interface RunGitLinkOptions {
	apiClient: APIClient;
	projectId: string;
	orgId: string;
	logger: Logger;
	branchOption?: string;
	rootOption?: string;
	noAuto?: boolean;
	noPreview?: boolean;
	skipAlreadyLinkedCheck?: boolean;
	config?: Config | null;
}

export interface RunGitLinkResult {
	linked: boolean;
	repoFullName?: string;
	branch?: string;
	autoDeploy?: boolean;
	cancelled?: boolean;
	noGithubConnected?: boolean;
	noReposFound?: boolean;
}

export async function runGitLink(options: RunGitLinkOptions): Promise<RunGitLinkResult> {
	const {
		apiClient,
		projectId,
		orgId,
		logger,
		branchOption,
		rootOption,
		noAuto = false,
		noPreview = false,
		skipAlreadyLinkedCheck = false,
		config,
	} = options;

	try {
		if (!skipAlreadyLinkedCheck) {
			const currentStatus = await tui.spinner({
				message: 'Checking current status...',
				clearOnSuccess: true,
				callback: () => getProjectGithubStatus(apiClient, projectId),
			});

			if (currentStatus.linked) {
				tui.newline();
				tui.warning(
					`This project is already linked to ${tui.bold(currentStatus.repoFullName ?? 'a repository')}`
				);
				tui.newline();

				const confirmed = await tui.confirm('Do you want to change the linked repository?');
				if (!confirmed) {
					tui.info('Cancelled');
					return { linked: false, cancelled: true };
				}
			}
		}

		let githubStatus = await tui.spinner({
			message: 'Checking GitHub connection...',
			clearOnSuccess: true,
			callback: () => getGithubIntegrationStatus(apiClient, orgId),
		});

		if (!githubStatus.connected || githubStatus.integrations.length === 0) {
			tui.newline();
			tui.warning('No GitHub accounts connected to this organization.');
			tui.newline();

			const wantConnect = await tui.confirm('Would you like to connect a GitHub account now?');
			if (!wantConnect) {
				tui.info('Cancelled');
				return { linked: false, cancelled: true };
			}

			const connectResult = await runGitAccountConnect({
				apiClient,
				orgId,
				logger,
				config,
			});

			if (!connectResult.connected) {
				if (connectResult.cancelled) {
					return { linked: false, cancelled: true };
				}
				return { linked: false, noGithubConnected: true };
			}

			githubStatus = await getGithubIntegrationStatus(apiClient, orgId);

			if (!githubStatus.connected || githubStatus.integrations.length === 0) {
				tui.error('GitHub connection failed. Please try again.');
				return { linked: false, noGithubConnected: true };
			}

			tui.newline();
			tui.info('Now continuing with repository linking...');
			tui.newline();
		}

		const gitInfo = detectGitInfo();

		const allRepos = await tui.spinner({
			message: 'Fetching available repositories...',
			clearOnSuccess: true,
			callback: () => listGithubRepos(apiClient, orgId),
		});

		if (allRepos.length === 0) {
			tui.newline();
			tui.error('No repositories found.');
			tui.newline();
			console.log('Make sure your GitHub App has access to the repositories you want to link.');
			return { linked: false, noReposFound: true };
		}

		let selectedRepo: GithubRepo | undefined;
		let confirmed = false;

		if (gitInfo.repo) {
			const detectedRepo = allRepos.find(
				(r) => r.fullName.toLowerCase() === gitInfo.repo!.toLowerCase()
			);
			if (detectedRepo) {
				tui.newline();
				tui.info(`Detected repository: ${tui.bold(detectedRepo.fullName)}`);
				tui.newline();

				const useDetected = await tui.confirm('Use this repository?');
				if (useDetected) {
					selectedRepo = detectedRepo;
				}
			}
		}

		if (!selectedRepo) {
			let repos = allRepos;

			if (githubStatus.integrations.length > 1) {
				tui.newline();

				const accountChoices = githubStatus.integrations.map((integration) => ({
					name: integration.githubAccountName,
					value: integration.id,
					message: `${integration.githubAccountName} ${tui.muted(`(${integration.githubAccountType})`)}`,
				}));

				const accountResponse = await enquirer.prompt<{ integrationId: string }>({
					type: 'select',
					name: 'integrationId',
					message: 'Select a GitHub account',
					choices: accountChoices,
					result(name: string) {
						// Return the value (id) instead of the name
						const choice = accountChoices.find((c) => c.name === name);
						return choice?.value ?? name;
					},
				});

				repos = await tui.spinner({
					message: 'Fetching repositories...',
					clearOnSuccess: true,
					callback: () => listGithubRepos(apiClient, orgId, accountResponse.integrationId),
				});

				if (repos.length === 0) {
					tui.newline();
					tui.error('No repositories found for this account.');
					return { linked: false, noReposFound: true };
				}
			}

			const repoChoices = repos.map((repo) => ({
				name: repo.fullName,
				message: `${repo.fullName} ${repo.private ? tui.muted('(private)') : ''} ${tui.muted(`[${repo.defaultBranch}]`)}`,
			}));

			tui.newline();

			const repoResponse = await enquirer.prompt<{ repoFullName: string }>({
				type: 'autocomplete',
				name: 'repoFullName',
				message: 'Select a repository',
				choices: repoChoices,
			});

			selectedRepo = repos.find((r) => r.fullName === repoResponse.repoFullName);
			if (!selectedRepo) {
				tui.error('Repository not found');
				return { linked: false };
			}
		}

		// Prompt for settings with defaults
		const defaultBranch = branchOption ?? gitInfo.branch ?? selectedRepo.defaultBranch;
		const defaultRoot = rootOption ?? '.';

		tui.newline();

		const { directory } = await enquirer.prompt<{ directory: string }>({
			type: 'input',
			name: 'directory',
			message: 'Root directory',
			initial: defaultRoot,
		});

		const { branch } = await enquirer.prompt<{ branch: string }>({
			type: 'input',
			name: 'branch',
			message: 'Branch to deploy from',
			initial: defaultBranch,
		});

		const finalAutoDeploy = await tui.confirm('Enable automatic deployments on push?', !noAuto);
		const finalPreviewDeploy = await tui.confirm(
			'Enable preview deployments on PRs?',
			!noPreview
		);

		tui.newline();
		console.log(tui.bold('Link Settings:'));
		console.log(`  Repository: ${selectedRepo.fullName}`);
		console.log(`  Branch: ${branch}`);
		console.log(`  Directory: ${directory}`);
		console.log(
			`  Auto-deploy: ${finalAutoDeploy ? tui.colorSuccess('enabled') : tui.muted('disabled')}`
		);
		console.log(
			`  Preview deploys: ${finalPreviewDeploy ? tui.colorSuccess('enabled') : tui.muted('disabled')}`
		);
		tui.newline();

		confirmed = await tui.confirm('Link this repository?');
		if (!confirmed) {
			tui.info('Cancelled');
			return { linked: false, cancelled: true };
		}

		await tui.spinner({
			message: 'Linking repository...',
			clearOnSuccess: true,
			callback: () =>
				linkProjectToRepo(apiClient, {
					projectId,
					repoFullName: selectedRepo.fullName,
					branch,
					autoDeploy: finalAutoDeploy,
					previewDeploy: finalPreviewDeploy,
					directory: directory === '.' ? undefined : directory,
					integrationId: selectedRepo.integrationId,
				}),
		});

		tui.newline();
		tui.success(`Linked project to ${tui.bold(selectedRepo.fullName)}`);
		tui.newline();

		if (finalAutoDeploy) {
			console.log(`Pushes to ${tui.bold(branch)} will trigger automatic deployments.`);
		}
		if (finalPreviewDeploy) {
			console.log('Pull requests will create preview deployments.');
		}

		return {
			linked: true,
			repoFullName: selectedRepo.fullName,
			branch,
			autoDeploy: finalAutoDeploy,
		};
	} catch (error) {
		const isCancel =
			error === '' ||
			(error instanceof Error && (error.message === '' || error.message === 'User cancelled'));

		if (isCancel) {
			tui.newline();
			tui.info('Cancelled');
			return { linked: false, cancelled: true };
		}

		logger.trace(error);
		throw error;
	}
}

const LinkOptionsSchema = z.object({
	repo: z.string().optional().describe('Repository full name (owner/repo) to link'),
	deploy: z.boolean().optional().describe('Enable automatic deployments on push (default: true)'),
	preview: z
		.boolean()
		.optional()
		.describe('Enable preview deployments on pull requests (default: true)'),
	branch: z.string().optional().describe('Branch to deploy from (default: repo default branch)'),
	root: z.string().optional().describe('Root directory containing agentuity.json (default: .)'),
	confirm: z.boolean().optional().describe('Skip confirmation prompts'),
});

const LinkResponseSchema = z.object({
	linked: z.boolean().describe('Whether the project was linked'),
	repoFullName: z.string().optional().describe('Repository that was linked'),
	branch: z.string().optional().describe('Branch configured'),
});

export const linkSubcommand = createSubcommand({
	name: 'link',
	description: 'Link a project to a GitHub repository',
	tags: ['mutating', 'creates-resource'],
	idempotent: false,
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		options: LinkOptionsSchema,
		response: LinkResponseSchema,
	},
	examples: [
		{
			command: getCommand('git link'),
			description: 'Link current project to a GitHub repository',
		},
		{
			command: getCommand('git link --repo owner/repo --branch main --confirm'),
			description: 'Link to a specific repo non-interactively',
		},
		{
			command: getCommand('git link --root .'),
			description: 'Link from the current directory',
		},
		{
			command: getCommand('git link --branch main'),
			description: 'Link to a specific branch',
		},
		{
			command: getCommand('git link --preview true'),
			description: 'Enable preview deployments on PRs',
		},
		{
			command: getCommand('git link --deploy false'),
			description: 'Disable automatic deployments on push',
		},
		{
			command: getCommand('git link --root packages/my-agent'),
			description: 'Link a subdirectory in a monorepo',
		},
		{
			command: getCommand('--json git link --repo owner/repo --branch main --confirm'),
			description: 'Link and return JSON result',
		},
	],

	async handler(ctx) {
		const { apiClient, project, opts, config, logger, options } = ctx;

		try {
			// Non-interactive mode when repo is provided
			// Note: integrationId is not passed in non-interactive mode. The API will
			// attempt to find a matching integration based on the repo owner. This may
			// fail if the org has multiple GitHub integrations with access to the same repo.
			if (opts.repo && opts.confirm) {
				const branch = opts.branch ?? 'main';
				const directory = opts.root === '.' ? undefined : opts.root;

				await tui.spinner({
					message: 'Linking repository...',
					clearOnSuccess: true,
					callback: () =>
						linkProjectToRepo(apiClient, {
							projectId: project.projectId,
							repoFullName: opts.repo!,
							branch,
							autoDeploy: opts.deploy !== false,
							previewDeploy: opts.preview !== false,
							directory,
						}),
				});

				if (!options.json) {
					tui.newline();
					tui.success(`Linked project to ${tui.bold(opts.repo)}`);
				}

				return { linked: true, repoFullName: opts.repo, branch };
			}

			const result = await runGitLink({
				apiClient,
				projectId: project.projectId,
				orgId: project.orgId,
				logger,
				branchOption: opts.branch,
				rootOption: opts.root,
				noAuto: opts.deploy === false,
				noPreview: opts.preview === false,
				config,
			});

			return {
				linked: result.linked,
				repoFullName: result.repoFullName,
				branch: result.branch,
			};
		} catch (error) {
			logger.trace(error);
			return logger.fatal('Failed to link repository: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
