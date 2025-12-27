import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { snapshotTag } from '@agentuity/server';

const SnapshotTagResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	tag: z.string().nullable().optional().describe('New tag'),
});

export const tagSubcommand = createCommand({
	name: 'tag',
	description: 'Add or update a tag on a snapshot',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot tag snp_abc123 latest'),
			description: 'Tag a snapshot as "latest"',
		},
		{
			command: getCommand('cloud sandbox snapshot tag snp_abc123 --clear'),
			description: 'Remove a tag from a snapshot',
		},
	],
	schema: {
		args: z.object({
			snapshotId: z.string().describe('Snapshot ID to tag'),
			tag: z.string().optional().describe('Tag name to apply'),
		}),
		options: z.object({
			clear: z.boolean().optional().describe('Remove the tag from the snapshot'),
		}),
		response: SnapshotTagResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		if (!args.tag && !opts.clear) {
			throw new Error('Either provide a tag name or use --clear to remove the tag');
		}

		const tag = opts.clear ? null : (args.tag ?? null);

		const snapshot = await snapshotTag(client, {
			snapshotId: args.snapshotId,
			tag,
			orgId,
		});

		if (!options.json) {
			if (tag) {
				tui.success(`tagged snapshot ${tui.bold(snapshot.snapshotId)} as ${tui.bold(tag)}`);
			} else {
				tui.success(`removed tag from snapshot ${tui.bold(snapshot.snapshotId)}`);
			}
		}

		return {
			snapshotId: snapshot.snapshotId,
			tag: snapshot.tag,
		};
	},
});

export default tagSubcommand;
