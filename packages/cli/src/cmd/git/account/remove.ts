import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import {
	getGithubIntegrationStatus,
	disconnectGithubIntegration,
	type GithubIntegration,
} from '../../integration/api';

export const removeSubcommand = createSubcommand({
	name: 'remove',
	description: 'Remove a GitHub account from your organization',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('git account remove'),
			description: 'Remove a GitHub account from your organization',
		},
	],

	async handler(ctx) {
		const { logger, apiClient } = ctx;

		try {
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
				tui.newline();
				tui.info('No GitHub accounts are connected.');
				return;
			}

			// Build choices showing GitHub account and org
			const choices = allIntegrations.map((item) => ({
				name: `${item.orgId}:${item.integration.id}`,
				message: `${item.integration.githubAccountName} ${tui.muted(`(${item.integration.githubAccountType})`)} → ${item.orgName}`,
			}));

			// Show picker
			const response = await enquirer.prompt<{ selection: string }>({
				type: 'select',
				name: 'selection',
				message: 'Select a GitHub account to remove',
				choices,
			});

			const [orgId, integrationId] = response.selection.split(':');
			const selected = allIntegrations.find(
				(i) => i.orgId === orgId && i.integration.id === integrationId
			);
			const displayName = selected
				? `${selected.integration.githubAccountName} from ${selected.orgName}`
				: response.selection;

			// Confirm
			const confirmed = await tui.confirm(`Are you sure you want to remove ${displayName}?`);

			if (!confirmed) {
				tui.newline();
				tui.info('Cancelled');
				return;
			}

			await tui.spinner({
				message: 'Removing GitHub account...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient, orgId, integrationId),
			});

			tui.newline();
			tui.success(`Removed ${tui.bold(displayName)}`);
		} catch (error) {
			// Handle user cancellation (Ctrl+C)
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return;
			}

			logger.trace(error);
			logger.fatal('Failed to remove GitHub account: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
