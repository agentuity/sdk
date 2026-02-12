import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { machineList } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const MachineListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Machine ID'),
		status: z.string().describe('Machine status'),
		provider: z.string().describe('Cloud provider'),
		region: z.string().describe('Region'),
		orgName: z.string().nullable().optional().describe('Organization name'),
		createdAt: z.string().describe('Creation timestamp'),
		privateIPv4: z.string().nullable().optional().describe('Private IPv4 address'),
		availabilityZone: z.string().nullable().optional().describe('Availability zone'),
		instanceType: z.string().nullable().optional().describe('Instance type'),
		instanceTags: z.array(z.string()).nullable().optional().describe('Instance tags'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List organization managed machines',
	tags: ['read-only', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud machine list'),
			description: 'List all machines',
		},
	],
	aliases: ['ls'],
	requires: { auth: true },
	idempotent: true,
	schema: {
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
		}),
		response: MachineListResponseSchema,
	},
	async handler(ctx) {
		const { options, opts, logger, auth, config } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		try {
			const machines = await machineList(catalystClient, { orgId: opts?.orgId });

			const result = machines.map((m) => ({
				id: m.id,
				status: m.status,
				provider: m.provider,
				region: m.region,
				orgName: m.orgName ?? undefined,
				createdAt: m.createdAt,
				privateIPv4: m.privateIPv4 ?? undefined,
				availabilityZone: m.availabilityZone ?? undefined,
				instanceType: m.instanceType ?? undefined,
				instanceTags: m.instanceTags ?? undefined,
			}));

			if (!options.json) {
				if (machines.length === 0) {
					tui.info('No machines found.');
				} else {
					const tableData = machines.map((m) => ({
						ID: m.id,
						Status: m.status,
						Provider: m.provider,
						Region: m.region,
						AZ: m.availabilityZone ?? '-',
						Type: m.instanceType ?? '-',
						'Private IP': m.privateIPv4 ?? '-',
						Tags: m.instanceTags?.join(', ') || '-',
						Created: new Date(m.createdAt).toLocaleString(),
					}));

					tui.table(tableData, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'Status', alignment: 'left' },
						{ name: 'Provider', alignment: 'left' },
						{ name: 'Region', alignment: 'left' },
						{ name: 'AZ', alignment: 'left' },
						{ name: 'Type', alignment: 'left' },
						{ name: 'Private IP', alignment: 'left' },
						{ name: 'Tags', alignment: 'left' },
						{ name: 'Created', alignment: 'left' },
					]);
				}
			}

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list machines: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
