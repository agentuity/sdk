import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { getCommand } from '../../../../command-prefix';
import { snapshotList } from '@agentuity/server';
import { getGlobalCatalystAPIClient } from '../../../../config';

const SnapshotInfoSchema = z.object({
	snapshotId: z.string(),
	name: z.string().nullable().optional(),
	fullName: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	tag: z.string().nullable().optional(),
	sizeBytes: z.number(),
	fileCount: z.number(),
	parentSnapshotId: z.string().nullable().optional(),
	public: z.boolean().optional(),
	orgName: z.string().optional(),
	orgSlug: z.string().optional(),
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
	requires: { auth: true, org: true },
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
		const { opts, options, auth, logger, orgId, config } = ctx;
		const client = await getGlobalCatalystAPIClient(logger, auth, config?.name);

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
						Name: snap.name ?? '-',
						Tag: snap.tag ?? '-',
						Size: tui.formatBytes(snap.sizeBytes),
						Files: snap.fileCount,
						'Created At': snap.createdAt,
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Name', alignment: 'left' },
					{ name: 'Tag', alignment: 'left' },
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
