import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { sandboxResolve, diskCheckpointList } from '@agentuity/server';

const CheckpointInfoSchema = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	parent: z.string(),
});

const CheckpointListResponseSchema = z.object({
	checkpoints: z.array(CheckpointInfoSchema).describe('List of disk checkpoints'),
	total: z.number().describe('Total number of checkpoints'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List disk checkpoints for a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox checkpoint list sbx_abc123'),
			description: 'List disk checkpoints for a sandbox',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({}),
		response: CheckpointListResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		const checkpoints = await diskCheckpointList(client, {
			sandboxId: args.sandboxId,
			orgId: sandboxInfo.orgId,
		});

		if (!options.json) {
			if (checkpoints.length === 0) {
				tui.info('No disk checkpoints found');
			} else {
				const tableData = checkpoints.map((ckpt) => ({
					ID: ckpt.id,
					Name: ckpt.name,
					'Created At': ckpt.createdAt,
					Parent: ckpt.parent || '-',
				}));
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Name', alignment: 'left' },
					{ name: 'Created At', alignment: 'left' },
					{ name: 'Parent', alignment: 'left' },
				]);

				tui.info(
					`Total: ${checkpoints.length} ${tui.plural(checkpoints.length, 'checkpoint', 'checkpoints')}`
				);
			}
		}

		return {
			checkpoints,
			total: checkpoints.length,
		};
	},
});

export default listSubcommand;
