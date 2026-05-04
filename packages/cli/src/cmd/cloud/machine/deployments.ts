import { machineDeployments } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { getGlobalCatalystAPIClient } from '../../../config.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';

const MachineDeploymentResponseSchema = z.array(
	z.object({
		id: z.string().describe('Deployment ID'),
		identifier: z.string().optional().describe('Deployment identifier'),
		state: z.string().optional().describe('Deployment state'),
		projectName: z.string().optional().describe('Project name'),
		projectId: z.string().optional().describe('Project ID'),
		paused: z.boolean().describe('Whether the deployment is paused'),
		domainSuffix: z.string().describe('Domain suffix'),
		url: z.string().describe('URL to the deployment'),
	})
);

export const deploymentsSubcommand = createSubcommand({
	name: 'deployments',
	description: 'List deployments running on a specific organization managed machine',
	tags: ['read-only', 'slow', 'requires-auth'],
	examples: [
		{
			command: `${getCommand('cloud machine deployments')} machine_abc123xyz`,
			description: 'List deployments on a machine',
		},
	],
	aliases: ['deps', 'deployment'],
	requires: { auth: true, org: true },
	idempotent: true,
	schema: {
		args: z.object({
			machine_id: z.string().describe('Machine ID'),
		}),
		response: MachineDeploymentResponseSchema,
	},
	async handler(ctx) {
		const { args, options, logger, auth, config, orgId } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			config?.name,
			orgId,
			config
		);

		try {
			const deployments = await machineDeployments(catalystClient, args.machine_id);

			const result = deployments.map((d) => ({
				id: d.id,
				identifier: d.identifier,
				state: d.state,
				projectName: d.project?.name,
				projectId: d.project?.id,
				paused: d.paused,
				domainSuffix: d.domainSuffix,
				url:
					d.customDomains?.length > 0
						? d.customDomains.map((domain) => `https://${domain}`).join(',')
						: d.identifier
							? `https://d${d.identifier}.${d.domainSuffix}`
							: d.project?.identifier
								? `https://p${d.project?.identifier}.${d.domainSuffix}`
								: '',
			}));

			if (!options.json) {
				if (deployments.length === 0) {
					tui.info('No deployments found on this machine.');
				} else {
					const tableData = result.map((d) => ({
						ID: d.id,
						State: d.state || 'unknown',
						Project: d.projectName ? `${d.projectName} (${d.projectId})` : '-',
						Paused: d.paused ? 'Yes' : 'No',
						URL: d.url,
					}));

					tui.table(tableData, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'State', alignment: 'left' },
						{ name: 'Project', alignment: 'left' },
						{ name: 'Paused', alignment: 'center' },
						{ name: 'URL', alignment: 'left' },
					]);
				}
			}

			return result;
		} catch (ex) {
			tui.fatal(`Failed to get machine deployments: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
