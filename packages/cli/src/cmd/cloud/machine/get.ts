import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { machineGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const MachineGetResponseSchema = z.object({
	id: z.string().describe('Machine ID'),
	status: z.string().describe('Machine status'),
	provider: z.string().describe('Cloud provider'),
	region: z.string().describe('Region'),
	instanceId: z.string().nullable().optional().describe('Cloud instance ID'),
	privateIPv4: z.string().nullable().optional().describe('Private IPv4 of the machine'),
	availabilityZone: z.string().nullable().optional().describe('Availability zone of the machine'),
	deploymentCount: z.number().describe('The number of deployments'),
	orgId: z.string().nullable().optional().describe('Organization ID'),
	orgName: z.string().nullable().optional().describe('Organization name'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().nullable().optional().describe('Last update timestamp'),
	startedAt: z.string().nullable().optional().describe('Start timestamp'),
	stoppedAt: z.string().nullable().optional().describe('Stop timestamp'),
	error: z.string().nullable().optional().describe('Error message if any'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get details about a specific organization managed machine',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: `${getCommand('cloud machine get')} machine_abc123xyz`,
			description: 'Get machine details by ID',
		},
	],
	aliases: ['show'],
	requires: { auth: true, org: true },
	idempotent: true,
	schema: {
		args: z.object({
			machine_id: z.string().describe('Machine ID'),
		}),
		response: MachineGetResponseSchema,
	},
	async handler(ctx) {
		const { args, options, logger, auth, config, orgId } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name, orgId);

		try {
			const machine = await machineGet(catalystClient, args.machine_id);

			if (!options.json) {
				const tableData: Record<string, string> = {
					ID: machine.id,
					Status: machine.status,
					Provider: machine.provider,
					Region: machine.region,
				};

				if (machine.instanceId) {
					tableData['Instance ID'] = machine.instanceId;
				}
				if (machine.privateIPv4) {
					tableData['Private IP'] = machine.privateIPv4;
				}
				if (machine.availabilityZone) {
					tableData['Availability Zone'] = machine.availabilityZone;
				}
				tableData['Deployments'] = (machine.deploymentCount ?? 0).toString();
				tableData['Created'] = new Date(machine.createdAt).toLocaleString();
				if (machine.updatedAt) {
					tableData['Updated'] = new Date(machine.updatedAt).toLocaleString();
				}
				if (machine.startedAt) {
					tableData['Started'] = new Date(machine.startedAt).toLocaleString();
				}
				if (machine.stoppedAt) {
					tableData['Stopped'] = new Date(machine.stoppedAt).toLocaleString();
				}
				if (machine.error) {
					tableData['Error'] = machine.error;
				}

				tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
			}

			return {
				id: machine.id,
				status: machine.status,
				provider: machine.provider,
				region: machine.region,
				instanceId: machine.instanceId ?? undefined,
				orgId: machine.orgId ?? undefined,
				orgName: machine.orgName ?? undefined,
				createdAt: machine.createdAt,
				updatedAt: machine.updatedAt ?? undefined,
				startedAt: machine.startedAt ?? undefined,
				stoppedAt: machine.stoppedAt ?? undefined,
				error: machine.error ?? undefined,
				deploymentCount: machine.deploymentCount ?? 0,
				privateIPv4: machine.privateIPv4,
				availabilityZone: machine.availabilityZone,
			};
		} catch (ex) {
			tui.fatal(`Failed to get machine: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
