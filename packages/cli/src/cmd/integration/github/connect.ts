import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { getAPIBaseURL } from '../../../api';
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

			// Sort orgs alphabetically
			const sortedOrgs = [...orgStatuses].sort((a, b) => a.name.localeCompare(b.name));

			// Build choices showing integration count
			const choices = sortedOrgs.map((org) => {
				const count = org.integrations.length;
				const suffix =
					count > 0 ? tui.muted(` (${count} GitHub account${count > 1 ? 's' : ''})`) : '';
				return {
					name: org.name,
					message: `${org.name}${suffix}`,
					value: org.id,
				};
			});

			// Show picker
			const response = await enquirer.prompt<{ orgName: string }>({
				type: 'select',
				name: 'orgName',
				message: 'Select an organization to connect',
				choices,
				result(name: string) {
					// @ts-expect-error - this.map exists at runtime
					return this.map(name)[name];
				},
			});

			const orgId = response.orgName;
			const selectedOrg = sortedOrgs.find((o) => o.id === orgId);
			const orgDisplay = selectedOrg ? selectedOrg.name : orgId;
			const initialCount = selectedOrg?.integrations.length ?? 0;

			// Check if user has existing GitHub integrations in other orgs
			const existingIntegrations = await tui.spinner({
				message: 'Checking for existing GitHub connections...',
				clearOnSuccess: true,
				callback: () => getExistingGithubIntegrations(apiClient, orgId),
			});

			// Filter out integrations already connected to target org
			const alreadyConnectedNames = new Set(
				selectedOrg?.integrations.map((i) => i.githubAccountName) ?? []
			);
			const availableIntegrations = existingIntegrations.filter(
				(i) => !alreadyConnectedNames.has(i.githubAccountName)
			);

			if (availableIntegrations.length > 0) {
				tui.newline();

				// Build checkbox choices
				const integrationChoices = availableIntegrations.map((i) => ({
					name: i.id,
					message: `${i.githubAccountName} ${tui.muted(`(from ${i.orgName})`)}`,
				}));

				console.log(tui.muted('Press enter with none selected to connect a new account'));
				tui.newline();

				const selectResponse = await enquirer.prompt<{ integrationIds: string[] }>({
					type: 'multiselect',
					name: 'integrationIds',
					message: 'Select GitHub accounts to connect',
					choices: integrationChoices,
				});

				if (selectResponse.integrationIds.length > 0) {
					const selectedIntegrations = availableIntegrations.filter((i) =>
						selectResponse.integrationIds.includes(i.id)
					);

					const accountNames = selectedIntegrations.map((i) => i.githubAccountName).join(', ');

					// Confirm
					const confirmResponse = await enquirer.prompt<{ confirm: boolean }>({
						type: 'confirm',
						name: 'confirm',
						message: `Connect ${tui.bold(accountNames)} to ${tui.bold(orgDisplay)}?`,
						initial: true,
					});

					if (confirmResponse.confirm) {
						await tui.spinner({
							message: `Copying ${selectedIntegrations.length} GitHub connection${selectedIntegrations.length > 1 ? 's' : ''}...`,
							clearOnSuccess: true,
							callback: async () => {
								for (const integration of selectedIntegrations) {
									await copyGithubIntegration(apiClient, integration.orgId, orgId);
								}
							},
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
			}

			const startResult = await tui.spinner({
				message: 'Getting GitHub authorization URL...',
				clearOnSuccess: true,
				callback: () => startGithubIntegration(apiClient, orgId),
			});

			if (!startResult) {
				tui.error('Failed to get GitHub authorization URL');
				return;
			}

			const { shortId } = startResult;
			const apiBaseUrl = getAPIBaseURL(ctx.config);
			const url = `${apiBaseUrl}/github/connect/${shortId}`;

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
					return await pollForGithubIntegration(apiClient, orgId, initialCount);
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
