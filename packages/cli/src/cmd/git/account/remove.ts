import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import { z } from 'zod';
import {
	getGithubIntegrationStatus,
	disconnectGithubIntegration,
	type GithubIntegration,
} from '../../integration/api';

const RemoveOptionsSchema = z.object({
	org: z.string().optional().describe('Organization ID'),
	account: z.string().optional().describe('GitHub integration ID to remove'),
	confirm: z.boolean().optional().describe('Skip confirmation prompt'),
});

const RemoveResponseSchema = z.object({
	removed: z.boolean().describe('Whether the account was removed'),
	orgId: z.string().optional().describe('Organization ID'),
	integrationId: z.string().optional().describe('Integration ID that was removed'),
});

export const removeSubcommand = createSubcommand({
	name: 'remove',
	description: 'Remove a GitHub account from your organization',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	schema: {
		options: RemoveOptionsSchema,
		response: RemoveResponseSchema,
	},
	examples: [
		{
			command: getCommand('git account remove'),
			description: 'Remove a GitHub account from your organization',
		},
		{
			command: getCommand('git account remove --org org_abc --account int_xyz --confirm'),
			description: 'Remove a specific account without prompts',
		},
		{
			command: getCommand('--json git account remove --org org_abc --account int_xyz --confirm'),
			description: 'Remove and return JSON result',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, opts, options } = ctx;

		try {
			// If both org and account provided, skip interactive flow
			if (opts.org && opts.account) {
				if (!opts.confirm) {
					const confirmed = await tui.confirm(
						`Are you sure you want to remove this GitHub account?`
					);
					if (!confirmed) {
						tui.info('Cancelled');
						return { removed: false };
					}
				}

				await tui.spinner({
					message: 'Removing GitHub account...',
					clearOnSuccess: true,
					callback: () => disconnectGithubIntegration(apiClient, opts.org!, opts.account!),
				});

				if (!options.json) {
					tui.newline();
					tui.success('Removed GitHub account');
				}

				return { removed: true, orgId: opts.org, integrationId: opts.account };
			}

			// Fetch organizations
			const orgs = await tui.spinner({
				message: 'Fetching organizations...',
				clearOnSuccess: true,
				callback: () => listOrganizations(apiClient),
			});

			if (orgs.length === 0) {
				tui.fatal('No organizations found for your account');
			}

			// Check GitHub status for each org
			const orgStatuses = await tui.spinner({
				message: 'Checking GitHub integration status...',
				clearOnSuccess: true,
				callback: async () => {
					const statuses = await Promise.all(
						orgs.map(async (org) => {
							const status = await getGithubIntegrationStatus(apiClient, org.id);
							return {
								...org,
								connected: status.connected,
								integrations: status.integrations,
							};
						})
					);
					return statuses;
				},
			});

			// Flatten all integrations across orgs
			const allIntegrations: Array<{
				orgId: string;
				orgName: string;
				integration: GithubIntegration;
			}> = [];

			for (const org of orgStatuses) {
				for (const integration of org.integrations) {
					allIntegrations.push({
						orgId: org.id,
						orgName: org.name,
						integration,
					});
				}
			}

			if (allIntegrations.length === 0) {
				if (!options.json) {
					tui.newline();
					tui.info('No GitHub accounts are connected.');
				}
				return { removed: false };
			}

			// Build choices showing GitHub account and org
			const choices = allIntegrations.map((item) => ({
				name: `${tui.bold(item.integration.githubAccountName)} ${tui.muted(`(${item.integration.githubAccountType})`)} → ${tui.bold(item.orgName)}`,
				value: `${item.orgId}:${item.integration.id}`,
			}));

			// Show picker
			const response = await enquirer.prompt<{ selection: string }>({
				type: 'select',
				name: 'selection',
				message: 'Select a GitHub account to remove',
				choices,
				result(name: string) {
					// Return the value (IDs) instead of the display name
					const choice = choices.find((c) => c.name === name);
					return choice?.value ?? name;
				},
			});

			const [orgId, integrationId] = response.selection.split(':');
			const selected = allIntegrations.find(
				(i) => i.orgId === orgId && i.integration.id === integrationId
			);
			const displayName = selected
				? `${tui.bold(selected.integration.githubAccountName)} from ${tui.bold(selected.orgName)}`
				: response.selection;

			// Confirm
			if (!opts.confirm) {
				const confirmed = await tui.confirm(`Are you sure you want to remove ${displayName}?`);

				if (!confirmed) {
					tui.newline();
					tui.info('Cancelled');
					return { removed: false };
				}
			}

			await tui.spinner({
				message: 'Removing GitHub account...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient, orgId, integrationId),
			});

			if (!options.json) {
				tui.newline();
				tui.success(`Removed ${displayName}`);
			}

			return { removed: true, orgId, integrationId };
		} catch (error) {
			// Handle user cancellation (Ctrl+C)
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { removed: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to remove GitHub account: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
