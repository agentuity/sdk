import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import enquirer from 'enquirer';
import { z } from 'zod';
import { getGithubIntegrationStatus, listGithubRepos } from './api';
import { ErrorCode } from '../../errors';
import { listOrganizations } from '@agentuity/server';

const ListOptionsSchema = z.object({
	org: z.string().optional().describe('Organization ID to list repos for'),
	account: z.string().optional().describe('GitHub account/integration ID to filter by'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List GitHub repositories accessible to your organization',
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
			command: getCommand('git list --org org_abc123'),
			description: 'List repos for a specific organization',
		},
		{
			command: getCommand('--json git list'),
			description: 'List repos in JSON format',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, opts, options } = ctx;

		try {
			// Get orgs
			const orgs = await tui.spinner({
				message: 'Fetching organizations...',
				clearOnSuccess: true,
				callback: () => listOrganizations(apiClient),
			});

			if (orgs.length === 0) {
				tui.error('No organizations found');
				return [];
			}

			// Select org
			let orgId = opts.org;
			if (!orgId) {
				if (orgs.length === 1) {
					orgId = orgs[0].id;
				} else {
					tui.newline();
					const orgChoices = orgs.map((o) => ({
						name: o.id,
						message: o.name,
					}));

					const response = await enquirer.prompt<{ orgId: string }>({
						type: 'select',
						name: 'orgId',
						message: 'Select an organization',
						choices: orgChoices,
					});
					orgId = response.orgId;
				}
			}

			// Check GitHub integrations
			const githubStatus = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient, orgId!),
			});

			if (!githubStatus.connected || githubStatus.integrations.length === 0) {
				tui.newline();
				tui.error('No GitHub accounts connected to this organization.');
				console.log(tui.muted(`Run ${tui.bold('agentuity git account add')} to connect one`));
				return [];
			}

			// Select account if multiple and not specified
			let integrationId = opts.account;
			if (!integrationId && githubStatus.integrations.length > 1) {
				tui.newline();
				const accountChoices = githubStatus.integrations.map((integration) => ({
					name: integration.id,
					message: `${integration.githubAccountName} ${tui.muted(`(${integration.githubAccountType})`)}`,
				}));

				const response = await enquirer.prompt<{ integrationId: string }>({
					type: 'select',
					name: 'integrationId',
					message: 'Select a GitHub account',
					choices: accountChoices,
				});
				integrationId = response.integrationId;
			}

			// Fetch repos
			const repos = await tui.spinner({
				message: 'Fetching repositories...',
				clearOnSuccess: true,
				callback: () => listGithubRepos(apiClient, orgId!, integrationId),
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
