import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { snapshotDelete } from '@agentuity/server';

const SnapshotDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	snapshotId: z.string().describe('Deleted snapshot ID'),
	message: z.string().optional().describe('Status message'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete a snapshot',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox snapshot delete snp_abc123'),
			description: 'Delete a snapshot',
		},
		{
			command: getCommand('cloud sandbox snapshot rm snp_abc123 --confirm'),
			description: 'Delete without confirmation prompt',
		},
	],
	schema: {
		args: z.object({
			snapshotId: z.string().describe('Snapshot ID to delete'),
		}),
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: SnapshotDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options, opts, auth, region, logger, orgId } = ctx;

		if (!opts.confirm) {
			const confirmed = await tui.confirm(`Delete snapshot "${args.snapshotId}"?`, false);
			if (!confirmed) {
				logger.info('Cancelled');
				return {
					success: false,
					snapshotId: args.snapshotId,
					message: 'Cancelled',
				};
			}
		}

		const client = createSandboxClient(logger, auth, region);

		await snapshotDelete(client, {
			snapshotId: args.snapshotId,
			orgId,
		});

		if (!options.json) {
			tui.success(`deleted snapshot ${tui.bold(args.snapshotId)}`);
		}

		return {
			success: true,
			snapshotId: args.snapshotId,
		};
	},
});

export default deleteSubcommand;
