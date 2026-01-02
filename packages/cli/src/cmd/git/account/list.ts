import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import { getGithubIntegrationStatus } from '../../integration/api';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List GitHub accounts connected to your organizations',
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('git account list'),
			description: 'List all connected GitHub accounts',
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

			tui.newline();
			console.log(tui.bold('GitHub Accounts'));
			tui.newline();

			let totalCount = 0;

			for (const org of sortedOrgs) {
				if (org.integrations.length === 0) {
					console.log(`  ${org.name} ${tui.muted('(no accounts connected)')}`);
				} else {
					console.log(`  ${org.name}`);
					for (const integration of org.integrations) {
						const typeLabel = integration.githubAccountType === 'org' ? 'org' : 'user';
						console.log(
							`    ${tui.colorSuccess('✓')} ${integration.githubAccountName} ${tui.muted(`(${typeLabel})`)}`
						);
						totalCount++;
					}
				}
			}

			tui.newline();
			if (totalCount === 0) {
				console.log(
					tui.muted(
						`No GitHub accounts connected. Run ${tui.bold('agentuity git account add')} to add one.`
					)
				);
			} else {
				console.log(
					tui.muted(`${totalCount} GitHub account${totalCount > 1 ? 's' : ''} connected`)
				);
			}
		} catch (error) {
			logger.trace(error);
			logger.fatal('Failed to list GitHub accounts: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
