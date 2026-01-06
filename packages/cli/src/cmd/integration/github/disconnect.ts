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
} from '../api';

export const disconnectSubcommand = createSubcommand({
	name: 'disconnect',
	description: 'Disconnect a GitHub account from your organization',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('integration github disconnect'),
			description: 'Disconnect a GitHub account from your organization',
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
				name: `${tui.bold(item.integration.githubAccountName)} ${tui.muted(`(${item.integration.githubAccountType})`)} → ${tui.bold(item.orgName)}`,
				value: `${item.orgId}:${item.integration.id}`,
			}));

			// Show picker
			const response = await enquirer.prompt<{ selection: string }>({
				type: 'select',
				name: 'selection',
				message: 'Select a GitHub account to disconnect',
				choices,
				result(name: string) {
					// Return the value (IDs) instead of the display name
					const choice = choices.find((c) => c.name === name);
					return choice?.value ?? name;
				},
			});

			const colonIdx = response.selection.indexOf(':');
			if (colonIdx === -1) {
				logger.fatal('Invalid selection format');
			}
			const orgId = response.selection.slice(0, colonIdx);
			const integrationId = response.selection.slice(colonIdx + 1);
			const selected = allIntegrations.find(
				(i) => i.orgId === orgId && i.integration.id === integrationId
			);
			const displayName = selected
				? `${tui.bold(selected.integration.githubAccountName)} from ${tui.bold(selected.orgName)}`
				: response.selection;

			// Confirm
			const confirmed = await tui.confirm(`Are you sure you want to disconnect ${displayName}?`);

			if (!confirmed) {
				tui.newline();
				tui.info('Cancelled');
				return;
			}

			await tui.spinner({
				message: 'Disconnecting GitHub...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient, orgId, integrationId),
			});

			tui.newline();
			tui.success(`Disconnected ${displayName}`);
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
			logger.fatal('GitHub disconnect failed: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
