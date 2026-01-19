import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { machineDeployments } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const MachineDeploymentResponseSchema = z.array(
	z.object({
		id: z.string().describe('Deployment ID'),
		identifier: z.string().optional().describe('Deployment identifier'),
		state: z.string().optional().describe('Deployment state'),
		projectName: z.string().optional().describe('Project name'),
		projectIdentifier: z.string().optional().describe('Project identifier'),
		paused: z.boolean().describe('Whether the deployment is paused'),
		domainSuffix: z.string().describe('Domain suffix'),
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
	aliases: ['deps'],
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
			orgId
		);

		try {
			const deployments = await machineDeployments(catalystClient, args.machine_id);

			const result = deployments.map((d) => ({
				id: d.id,
				identifier: d.identifier,
				state: d.state,
				projectName: d.project?.name,
				projectIdentifier: d.project?.identifier,
				paused: d.paused,
				domainSuffix: d.domainSuffix,
			}));

			if (!options.json) {
				if (deployments.length === 0) {
					tui.info('No deployments found on this machine.');
				} else {
					const tableData = deployments.map((d) => ({
						ID: d.id,
						Identifier: d.identifier || '-',
						State: d.state || 'unknown',
						Project: d.project?.name || '-',
						Paused: d.paused ? 'Yes' : 'No',
						Domain: d.project?.identifier
							? `${d.project.identifier}.${d.domainSuffix}`
							: d.domainSuffix,
					}));

					tui.table(tableData, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'Identifier', alignment: 'left' },
						{ name: 'State', alignment: 'left' },
						{ name: 'Project', alignment: 'left' },
						{ name: 'Paused', alignment: 'center' },
						{ name: 'Domain', alignment: 'left' },
					]);
				}
			}

			return result;
		} catch (ex) {
			tui.fatal(`Failed to get machine deployments: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
