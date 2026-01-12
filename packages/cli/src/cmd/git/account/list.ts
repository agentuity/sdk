import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import { getGithubIntegrationStatus } from '../api';
import { z } from 'zod';

const ListResponseSchema = z.array(
	z.object({
		orgId: z.string().describe('Organization ID'),
		orgName: z.string().describe('Organization name'),
		integrations: z.array(
			z.object({
				id: z.string().describe('Integration ID'),
				githubAccountName: z.string().describe('GitHub account name'),
				githubAccountType: z.enum(['user', 'org']).describe('Account type'),
			})
		),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List GitHub accounts connected to your organizations',
	aliases: ['ls'],
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	schema: {
		response: ListResponseSchema,
	},
	examples: [
		{
			command: getCommand('git account list'),
			description: 'List all connected GitHub accounts',
		},
		{
			command: getCommand('--json git account list'),
			description: 'List accounts in JSON format',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, options } = ctx;

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

			const result = sortedOrgs.map((org) => ({
				orgId: org.id,
				orgName: org.name,
				integrations: org.integrations.map((i) => ({
					id: i.id,
					githubAccountName: i.githubAccountName,
					githubAccountType: i.githubAccountType,
				})),
			}));

			if (options.json) {
				return result;
			}

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

			return result;
		} catch (error) {
			logger.trace(error);
			return logger.fatal(
				'Failed to list GitHub accounts: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
