import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { snapshotList } from '@agentuity/server';

const SnapshotInfoSchema = z.object({
	snapshotId: z.string(),
	sandboxId: z.string().optional(),
	tag: z.string().nullable().optional(),
	sizeBytes: z.number(),
	fileCount: z.number(),
	parentSnapshotId: z.string().nullable().optional(),
	createdAt: z.string(),
});

const SnapshotListResponseSchema = z.object({
	snapshots: z.array(SnapshotInfoSchema).describe('List of snapshots'),
	total: z.number().describe('Total number of snapshots'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List snapshots',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot list'),
			description: 'List all snapshots',
		},
		{
			command: getCommand('cloud sandbox snapshot list --sandbox sbx_abc123'),
			description: 'List snapshots for a specific sandbox',
		},
	],
	schema: {
		options: z.object({
			sandbox: z.string().optional().describe('Filter by sandbox ID'),
			limit: z.number().optional().describe('Maximum number of results'),
			offset: z.number().optional().describe('Offset for pagination'),
		}),
		response: SnapshotListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const result = await snapshotList(client, {
			sandboxId: opts.sandbox,
			limit: opts.limit,
			offset: opts.offset,
			orgId,
		});

		if (!options.json) {
			if (result.snapshots.length === 0) {
				tui.info('No snapshots found');
			} else {
				const tableData = result.snapshots.map((snap) => {
					return {
						ID: snap.snapshotId,
						Tag: snap.tag ?? '-',
						Sandbox: snap.sandboxId ?? '(deleted)',
						Size: tui.formatBytes(snap.sizeBytes),
						Files: snap.fileCount,
						'Created At': snap.createdAt,
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Tag', alignment: 'left' },
					{ name: 'Sandbox', alignment: 'left' },
					{ name: 'Size', alignment: 'right' },
					{ name: 'Files', alignment: 'right' },
					{ name: 'Created At', alignment: 'left' },
				]);

				tui.info(`Total: ${result.total} ${tui.plural(result.total, 'snapshot', 'snapshots')}`);
			}
		}

		return result;
	},
});

export default listSubcommand;
