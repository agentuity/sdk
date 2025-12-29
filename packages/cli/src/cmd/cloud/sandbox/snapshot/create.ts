import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { snapshotCreate } from '@agentuity/server';

const SnapshotCreateResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	sandboxId: z.string().describe('Source sandbox ID'),
	tag: z.string().optional().nullable().describe('Snapshot tag'),
	sizeBytes: z.number().describe('Snapshot size in bytes'),
	fileCount: z.number().describe('Number of files in snapshot'),
	createdAt: z.string().describe('Snapshot creation timestamp'),
});

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a snapshot from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot create sbx_abc123'),
			description: 'Create a snapshot from a sandbox',
		},
		{
			command: getCommand('cloud sandbox snapshot create sbx_abc123 --tag latest'),
			description: 'Create a tagged snapshot',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID to snapshot'),
		}),
		options: z.object({
			tag: z.string().optional().describe('Tag for the snapshot'),
		}),
		response: SnapshotCreateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const snapshot = await snapshotCreate(client, {
			sandboxId: args.sandboxId,
			tag: opts.tag,
			orgId,
		});

		if (!options.json) {
			tui.success(`created snapshot ${tui.bold(snapshot.snapshotId)}`);
			tui.info(`Size: ${tui.formatBytes(snapshot.sizeBytes)}, Files: ${snapshot.fileCount}`);
			if (snapshot.tag) {
				tui.info(`Tag: ${snapshot.tag}`);
			}
		}

		return {
			snapshotId: snapshot.snapshotId,
			sandboxId: snapshot.sandboxId,
			tag: snapshot.tag ?? undefined,
			sizeBytes: snapshot.sizeBytes,
			fileCount: snapshot.fileCount,
			createdAt: snapshot.createdAt,
		};
	},
});

export default createSubcommand;
