import { z } from 'zod';
import { createSubcommand, createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { saveOrgId, clearOrgId } from '../../../config';
import * as tui from '../../../tui';
import { listOrganizations } from '@agentuity/server';
import { enrollSubcommand } from './enroll';
import { unenrollSubcommand } from './unenroll';
import { statusSubcommand } from './status';

const selectCommand = createSubcommand({
	name: 'select',
	description: 'Set the default organization for all commands',
	tags: ['fast', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{ command: getCommand('auth org select'), description: 'Select default organization' },
		{
			command: getCommand('auth org select org_abc123'),
			description: 'Set specific organization as default',
		},
	],
	schema: {
		args: z.object({
			org_id: z.string().optional().describe('Organization ID to set as default'),
		}),
		response: z.object({
			orgId: z.string().describe('The selected organization ID'),
			name: z.string().describe('The organization name'),
		}),
	},

	async handler(ctx) {
		const { apiClient, args, options } = ctx;
		const argOrgId = args.org_id;

		const orgs = await tui.spinner({
			message: 'Fetching organizations',
			clearOnSuccess: true,
			callback: () => listOrganizations(apiClient),
		});

		if (orgs.length === 0) {
			tui.fatal('No organizations found for your account');
		}

		let selectedOrgId = argOrgId;

		if (selectedOrgId) {
			const org = orgs.find((o) => o.id === selectedOrgId);
			if (!org) {
				tui.fatal(
					`Organization '${selectedOrgId}' not found. Use '${getCommand('auth org select')}' to see available organizations.`
				);
			}
		} else {
			if (!process.stdin.isTTY) {
				tui.fatal(
					'Organization ID required in non-interactive mode. Usage: ' +
						getCommand('auth org select <org_id>')
				);
			}
			selectedOrgId = await tui.selectOrganization(orgs);
		}

		await saveOrgId(selectedOrgId);

		const selectedOrg = orgs.find((o) => o.id === selectedOrgId)!;

		if (!options.json) {
			tui.success(`Default organization set to ${tui.bold(selectedOrg.name)}`);
		}

		return { orgId: selectedOrgId, name: selectedOrg.name };
	},
});

const unselectCommand = createSubcommand({
	name: 'unselect',
	description: 'Clear the default organization preference',
	tags: ['fast', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{ command: getCommand('auth org unselect'), description: 'Clear default organization' },
	],
	schema: {
		response: z.object({
			cleared: z.boolean().describe('Whether the preference was cleared'),
		}),
	},

	async handler(ctx) {
		const { options, config } = ctx;

		const hadOrg = !!config?.preferences?.orgId;
		await clearOrgId();

		if (!options.json) {
			if (hadOrg) {
				tui.success('Default organization cleared');
			} else {
				tui.info('No default organization was set');
			}
		}

		return { cleared: hadOrg };
	},
});

const currentCommand = createSubcommand({
	name: 'current',
	description: 'Show the current default organization',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	examples: [
		{ command: getCommand('auth org current'), description: 'Show default organization ID' },
		{
			command: getCommand('auth org current --name'),
			description: 'Show default organization name',
		},
		{ command: getCommand('auth org current --json'), description: 'Show output in JSON format' },
	],
	schema: {
		options: z.object({
			name: z.boolean().optional().describe('Show organization name instead of ID'),
		}),
		response: z
			.object({
				id: z.string().nullable().describe('The current organization ID or null if not set'),
				name: z
					.string()
					.nullable()
					.describe('The current organization name or null if not set or not found'),
			})
			.describe('The current organization details'),
	},

	async handler(ctx) {
		const { options, config, apiClient, opts } = ctx;
		const orgId = config?.preferences?.orgId || null;

		let orgName: string | null = null;

		// Fetch org name if we have an orgId and either --name or --json is requested
		if (orgId && (opts.name || options.json)) {
			const orgs = await listOrganizations(apiClient);
			const org = orgs.find((o) => o.id === orgId);
			orgName = org?.name ?? null;
		}

		if (!options.json) {
			if (opts.name) {
				// --name flag: print only the org name
				if (orgName) {
					console.log(orgName);
				}
			} else {
				// Default behavior: print only the org ID
				if (orgId) {
					console.log(orgId);
				}
			}
		}

		return { id: orgId, name: orgName };
	},
});

export const orgSubcommand = createCommand({
	name: 'org',
	aliases: ['machine', 'organization'],
	description: 'Manage organization preferences and machine authentication',
	tags: ['fast'],
	examples: [
		{ command: getCommand('auth org select'), description: 'Set default organization' },
		{ command: getCommand('auth org current'), description: 'Show current default' },
		{
			command: getCommand('auth org enroll --file ./public-key.pem'),
			description: 'Enroll an organization',
		},
		{ command: getCommand('auth org status'), description: 'Show org auth status' },
	],
	subcommands: [
		selectCommand,
		unselectCommand,
		currentCommand,
		enrollSubcommand,
		unenrollSubcommand,
		statusSubcommand,
	],
});
