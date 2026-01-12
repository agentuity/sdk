import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { listOrganizations } from '@agentuity/server';
import { getOrInitConfig, saveConfig } from '../../config';
import { z } from 'zod';

export const organizationSubcommand = createSubcommand({
	name: 'organization',
	aliases: ['org'],
	description:
		'View or change the organization for Agentuity Coder. This determines where session memory, KV storage, vector search, sandboxes, and other cloud services are used.',
	tags: ['fast'],
	requires: { auth: true, apiClient: true },
	schema: {
		args: z.object({
			orgId: z.string().optional().describe('Organization ID to set (omit to show current or select)'),
		}),
	},
	examples: [
		{
			command: getCommand('coder organization'),
			description: 'Show current organization or select from list',
		},
		{
			command: getCommand('coder organization org_abc123'),
			description: 'Set organization to org_abc123',
		},
	],
	async handler(ctx) {
		const { apiClient, config, args } = ctx;

		const currentOrg = config?.coder?.org ?? config?.preferences?.orgId;

		// If org ID provided as argument, set it directly
		if (args.orgId) {
			// Validate the org exists
			const orgs = await tui.spinner({
				message: 'Validating organization',
				clearOnSuccess: true,
				callback: async () => {
					return listOrganizations(apiClient);
				},
			});

			const targetOrg = orgs.find((o) => o.id === args.orgId);
			if (!targetOrg) {
				tui.error(`Organization not found: ${args.orgId}`);
				tui.newline();
				tui.info('Available organizations:');
				for (const org of orgs) {
					tui.output(`  ${tui.ICONS.bullet} ${org.id} (${org.name})`);
				}
				return { success: false };
			}

			if (args.orgId === currentOrg) {
				tui.info(`Already using organization: ${args.orgId}`);
				return { success: true, orgId: args.orgId, changed: false };
			}

			const baseConfig = await getOrInitConfig();
			const updatedConfig = {
				...baseConfig,
				...config,
				coder: {
					...config?.coder,
					org: args.orgId,
				},
			};
			await saveConfig(updatedConfig);
			tui.success(`Changed organization to: ${args.orgId} (${targetOrg.name})`);
			return { success: true, orgId: args.orgId, changed: true };
		}

		// No argument - show current or let user select
		tui.newline();

		if (currentOrg) {
			tui.output(`Current organization: ${tui.bold(currentOrg)}`);
			tui.newline();
		}

		const orgs = await tui.spinner({
			message: 'Fetching organizations',
			clearOnSuccess: true,
			callback: async () => {
				return listOrganizations(apiClient);
			},
		});

		if (orgs.length === 0) {
			tui.error('No organizations found for your account.');
			tui.info('Please create an organization at https://agentuity.com');
			return { success: false };
		}

		if (orgs.length === 1) {
			const org = orgs[0];
			if (org.id === currentOrg) {
				tui.info(`You only have one organization: ${org.id} (${org.name})`);
				return { success: true, orgId: org.id, changed: false };
			}
			// Auto-set the only org
			const baseConfig = await getOrInitConfig();
			const updatedConfig = {
				...baseConfig,
				...config,
				coder: {
					...config?.coder,
					org: org.id,
				},
			};
			await saveConfig(updatedConfig);
			tui.success(`Set organization to: ${org.id} (${org.name})`);
			return { success: true, orgId: org.id, changed: true };
		}

		// Multiple orgs - let user select
		const selectedOrgId = await tui.selectOrganization(orgs, currentOrg);

		if (selectedOrgId === currentOrg) {
			tui.info('Organization unchanged');
			return { success: true, orgId: selectedOrgId, changed: false };
		}

		const baseConfig = await getOrInitConfig();
		const updatedConfig = {
			...baseConfig,
			...config,
			coder: {
				...config?.coder,
				org: selectedOrgId,
			},
		};
		await saveConfig(updatedConfig);

		const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
		tui.success(`Changed organization to: ${selectedOrgId} (${selectedOrg?.name ?? 'unknown'})`);

		return { success: true, orgId: selectedOrgId, changed: true };
	},
});

export default organizationSubcommand;
