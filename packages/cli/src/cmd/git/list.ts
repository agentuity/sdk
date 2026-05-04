import enquirer from 'enquirer';
import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';
import * as tui from '../../tui.ts';
import { createSubcommand } from '../../types.ts';
import { getGithubIntegrationStatus, listGithubRepos } from './api.ts';

const ListOptionsSchema = z.object({
	account: z.string().optional().describe('GitHub account name to filter by'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List GitHub repositories accessible to your account',
	aliases: ['ls'],
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	schema: {
		options: ListOptionsSchema,
	},
	examples: [
		{
			command: getCommand('git list'),
			description: 'List all accessible GitHub repositories',
		},
		{
			command: getCommand('git list --account my-org'),
			description: 'List repos for a specific GitHub account',
		},
		{
			command: getCommand('--json git list'),
			description: 'List repos in JSON format',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, opts, options } = ctx;

		try {
			// Check GitHub connection
			const githubStatus = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient),
			});

			if (!githubStatus.connected || githubStatus.installations.length === 0) {
				tui.newline();
				tui.error('No GitHub accounts connected.');
				console.log(tui.muted(`Run ${tui.bold('agentuity git account add')} to connect one`));
				return [];
			}

			// Select installation if multiple and not specified
			let integrationId: string | undefined;

			if (opts.account) {
				// Match by account name
				const matched = githubStatus.installations.find(
					(inst) => inst.accountName.toLowerCase() === opts.account!.toLowerCase()
				);
				if (!matched) {
					tui.newline();
					tui.error(`No installation found for account "${opts.account}"`);
					console.log(
						tui.muted(
							`Available: ${githubStatus.installations.map((i) => i.accountName).join(', ')}`
						)
					);
					return [];
				}
				integrationId = matched.integrationId;
			} else if (githubStatus.installations.length > 1) {
				tui.newline();
				const accountChoices = githubStatus.installations.map((installation) => ({
					name: installation.installationId,
					message: `${installation.accountName} ${tui.muted(`(${installation.accountType})`)}`,
					value: installation.integrationId,
				}));

				const response = await enquirer.prompt<{ installationId: string }>({
					type: 'select',
					name: 'installationId',
					message: 'Select a GitHub account',
					choices: accountChoices,
					result(name: string) {
						// Return the value (integrationId) instead of the display name
						const choice = accountChoices.find((c) => c.name === name);
						return choice?.value ?? name;
					},
				});
				integrationId = response.installationId;
			} else {
				// Single installation — use its integrationId
				integrationId = githubStatus.installations[0]?.integrationId;
			}

			// Fetch repos
			const repos = await tui.spinner({
				message: 'Fetching repositories...',
				clearOnSuccess: true,
				callback: () => listGithubRepos(apiClient, integrationId),
			});

			if (repos.length === 0) {
				tui.newline();
				tui.info('No repositories found.');
				console.log(
					tui.muted('Make sure your GitHub App has access to the repositories you want.')
				);
				return [];
			}

			if (!options.json) {
				tui.newline();
				console.log(tui.bold(`${repos.length} repositories`));
				tui.newline();

				for (const repo of repos) {
					const visibility = repo.private ? tui.muted('private') : 'public';
					console.log(
						`  ${repo.fullName} ${tui.muted(`[${repo.defaultBranch}]`)} ${visibility}`
					);
				}
				tui.newline();
			}

			return repos;
		} catch (error) {
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return [];
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to list repositories: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
