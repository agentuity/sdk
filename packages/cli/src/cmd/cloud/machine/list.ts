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
	requires: { auth: true, org: true },
	idempotent: true,
	schema: {
		response: MachineListResponseSchema,
	},
	async handler(ctx) {
		const { options, logger, auth, config, orgId } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name, orgId);

		try {
			const machines = await machineList(catalystClient);

			const result = machines.map((m) => ({
				id: m.id,
				status: m.status,
				provider: m.provider,
				region: m.region,
				orgName: m.orgName ?? undefined,
				createdAt: m.createdAt,
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
						Created: new Date(m.createdAt).toLocaleString(),
					}));

					tui.table(tableData, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'Status', alignment: 'left' },
						{ name: 'Provider', alignment: 'left' },
						{ name: 'Region', alignment: 'left' },
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
