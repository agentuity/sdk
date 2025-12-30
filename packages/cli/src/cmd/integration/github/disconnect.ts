import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import { getGithubIntegrationStatus, disconnectGithubIntegration } from '../api';

export const disconnectSubcommand = createSubcommand({
	name: 'disconnect',
	description: 'Disconnect GitHub from your organization',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('integration github disconnect'),
			description: 'Disconnect GitHub from your organization',
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
							return { ...org, connected: status.connected };
						})
					);
					return statuses;
				},
			});

			// Filter to only connected orgs
			const connectedOrgs = orgStatuses.filter((org) => org.connected);

			if (connectedOrgs.length === 0) {
				tui.newline();
				tui.info('No organizations have GitHub connected.');
				return;
			}

			// Build choices - only show connected orgs
			const choices = connectedOrgs.map((org) => ({
				name: org.id,
				message: `${org.name} ${tui.muted('(connected)')}`,
			}));

			// Show picker
			const response = await enquirer.prompt<{ orgId: string }>({
				type: 'select',
				name: 'orgId',
				message: 'Select an organization to disconnect',
				choices,
			});

			const orgId = response.orgId;
			const selectedOrg = connectedOrgs.find((o) => o.id === orgId);
			const orgDisplay = selectedOrg ? selectedOrg.name : orgId;

			// Confirm
			const confirmed = await tui.confirm(
				`Are you sure you want to disconnect GitHub from ${orgDisplay}?`
			);

			if (!confirmed) {
				tui.newline();
				tui.info('Cancelled');
				return;
			}

			await tui.spinner({
				message: 'Disconnecting GitHub...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient, orgId),
			});

			tui.newline();
			tui.success(`GitHub disconnected from ${tui.bold(orgDisplay)}`);
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
