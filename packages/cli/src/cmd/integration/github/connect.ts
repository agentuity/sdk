import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import {
	startGithubIntegration,
	pollForGithubIntegration,
	getGithubIntegrationStatus,
	getExistingGithubIntegrations,
	copyGithubIntegration,
} from '../api';

export const connectSubcommand = createSubcommand({
	name: 'connect',
	description: 'Connect your GitHub account to enable automatic deployments',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('integration github connect'),
			description: 'Connect GitHub to your organization',
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

			// Sort: connected orgs at top
			const sortedOrgs = [...orgStatuses].sort((a, b) => {
				if (a.connected && !b.connected) return -1;
				if (!a.connected && b.connected) return 1;
				return a.name.localeCompare(b.name);
			});

			// Check if all orgs are connected
			const allConnected = sortedOrgs.every((org) => org.connected);

			if (allConnected) {
				// Show all orgs as connected
				tui.newline();
				console.log(tui.bold('GitHub Integration Status'));
				tui.newline();
				for (const org of sortedOrgs) {
					console.log(`  ${tui.colorSuccess('✓')} ${org.name} ${tui.muted('(connected)')}`);
				}
				tui.newline();
				return;
			}

			// Build choices with connected status shown in green at top
			const choices = sortedOrgs.map((org) => ({
				name: org.id,
				message: org.connected ? tui.colorSuccess(`✓ ${org.name} (connected)`) : org.name,
				disabled: org.connected ? '' : false,
			}));

			// Show picker
			const response = await enquirer.prompt<{ orgId: string }>({
				type: 'select',
				name: 'orgId',
				message: 'Select an organization to connect',
				choices,
			});

			const orgId = response.orgId;
			const selectedOrg = sortedOrgs.find((o) => o.id === orgId);
			const orgDisplay = selectedOrg ? selectedOrg.name : orgId;

			// Check if user has existing GitHub integrations in other orgs
			const existingIntegrations = await tui.spinner({
				message: 'Checking for existing GitHub connections...',
				clearOnSuccess: true,
				callback: () => getExistingGithubIntegrations(apiClient, orgId),
			});

			if (existingIntegrations.length > 0) {
				// Offer to copy from existing integration
				const existing = existingIntegrations[0];
				tui.newline();
				const copyResponse = await enquirer.prompt<{ useCopy: boolean }>({
					type: 'confirm',
					name: 'useCopy',
					message: `Use existing GitHub connection from ${tui.bold(existing.orgName)}?`,
					initial: true,
				});

				if (copyResponse.useCopy) {
					await tui.spinner({
						message: 'Copying GitHub connection...',
						clearOnSuccess: true,
						callback: () => copyGithubIntegration(apiClient, existing.orgId, orgId),
					});

					tui.newline();
					tui.success(`GitHub connected to ${tui.bold(orgDisplay)}`);
					tui.newline();
					console.log(
						'You can now link repositories to your projects for automatic deployments.'
					);
					return;
				}
			}

			const startResult = await tui.spinner({
				message: 'Getting GitHub authorization URL...',
				clearOnSuccess: true,
				callback: () => startGithubIntegration(apiClient, orgId),
			});

			if (!startResult) {
				return;
			}

			const { url } = startResult;

			const copied = await tui.copyToClipboard(url);

			tui.newline();
			if (copied) {
				console.log('GitHub authorization URL copied to clipboard! Open it in your browser:');
			} else {
				console.log('Open this URL in your browser to authorize GitHub access:');
			}
			tui.newline();
			console.log(`  ${tui.link(url)}`);
			tui.newline();
			console.log(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
			tui.newline();

			const result = await tui.spinner({
				type: 'countdown',
				message: 'Waiting for GitHub authorization',
				timeoutMs: 600000, // 10 minutes
				clearOnSuccess: true,
				onEnterPress: () => {
					const platform = process.platform;
					if (platform === 'win32') {
						Bun.spawn(['cmd', '/c', 'start', '', url], {
							stdout: 'ignore',
							stderr: 'ignore',
						});
					} else {
						const command = platform === 'darwin' ? 'open' : 'xdg-open';
						Bun.spawn([command, url], { stdout: 'ignore', stderr: 'ignore' });
					}
				},
				callback: async () => {
					return await pollForGithubIntegration(apiClient, orgId);
				},
			});

			tui.newline();
			if (result.connected) {
				tui.success(`GitHub connected to ${tui.bold(orgDisplay)}`);
				tui.newline();
				console.log(
					'You can now link repositories to your projects for automatic deployments.'
				);
			}
		} catch (error) {
			// Handle user cancellation (Ctrl+C) - enquirer throws empty string or Error with empty message
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
			logger.fatal('GitHub integration failed: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
