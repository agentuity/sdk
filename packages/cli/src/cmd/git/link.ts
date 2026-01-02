import { createSubcommand } from '../../types';
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
	type GithubIntegrationStatusResult,
} from '../integration/api';
import type { APIClient } from '../../api';
import type { Logger } from '@agentuity/core';

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
	autoDeploy?: boolean;
	previewDeploy?: boolean;
	skipAlreadyLinkedCheck?: boolean;
}

export interface RunGitLinkResult {
	linked: boolean;
	repoFullName?: string;
	branch?: string;
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
		autoDeploy = true,
		previewDeploy = true,
		skipAlreadyLinkedCheck = false,
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

		const githubStatus = await tui.spinner({
			message: 'Checking GitHub connection...',
			clearOnSuccess: true,
			callback: () => getGithubIntegrationStatus(apiClient, orgId),
		});

		if (!githubStatus.connected || githubStatus.integrations.length === 0) {
			tui.newline();
			tui.error('No GitHub accounts connected to this organization.');
			tui.newline();
			console.log(
				`Run ${tui.bold('agentuity git account add')} to connect a GitHub account first.`
			);
			return { linked: false, noGithubConnected: true };
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
					name: integration.id,
					message: `${integration.githubAccountName} ${tui.muted(`(${integration.githubAccountType})`)}`,
				}));

				const accountResponse = await enquirer.prompt<{ integrationId: string }>({
					type: 'select',
					name: 'integrationId',
					message: 'Select a GitHub account',
					choices: accountChoices,
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

		const finalAutoDeploy = await tui.confirm(
			'Enable automatic deployments on push?',
			autoDeploy
		);
		const finalPreviewDeploy = await tui.confirm(
			'Enable preview deployments on PRs?',
			previewDeploy
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

		return { linked: true, repoFullName: selectedRepo.fullName, branch };
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
	deploy: z.boolean().optional().describe('Enable automatic deployments on push (default: true)'),
	preview: z
		.boolean()
		.optional()
		.describe('Enable preview deployments on pull requests (default: true)'),
	branch: z.string().optional().describe('Branch to deploy from (default: repo default branch)'),
	root: z.string().optional().describe('Root directory containing agentuity.json (default: .)'),
});

export const linkSubcommand = createSubcommand({
	name: 'link',
	description: 'Link a project to a GitHub repository',
	tags: ['mutating', 'creates-resource'],
	idempotent: false,
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		options: LinkOptionsSchema,
	},
	examples: [
		{
			command: getCommand('git link'),
			description: 'Link current project to a GitHub repository',
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
	],

	async handler(ctx) {
		const { logger, apiClient, project, opts } = ctx;

		try {
			await runGitLink({
				apiClient,
				projectId: project.projectId,
				orgId: project.orgId,
				logger,
				branchOption: opts.branch,
				rootOption: opts.root ?? '.',
				autoDeploy: opts.deploy ?? true,
				previewDeploy: opts.preview ?? true,
			});
		} catch (error) {
			logger.fatal('Failed to link repository: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
