import { snapshotCreate } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../../command-prefix';
import * as tui from '../../../../tui';
import { createCommand } from '../../../../types';
import { createSandboxClient, getSandboxRegion } from '../util';

const SNAPSHOT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const SNAPSHOT_TAG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_SNAPSHOT_TAG_LENGTH = 128;

const SnapshotCreateResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	name: z.string().describe('Snapshot display name'),
	description: z.string().optional().nullable().describe('Snapshot description'),
	tag: z.string().optional().nullable().describe('Snapshot tag (defaults to "latest")'),
	sizeBytes: z.number().describe('Snapshot size in bytes'),
	fileCount: z.number().describe('Number of files in snapshot'),
	createdAt: z.string().describe('Snapshot creation timestamp'),
});

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a snapshot from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot create sbx_abc123'),
			description: 'Create a snapshot from a sandbox',
		},
		{
			command: getCommand('cloud sandbox snapshot create sbx_abc123 --tag latest'),
			description: 'Create a tagged snapshot',
		},
		{
			command: getCommand(
				'cloud sandbox snapshot create sbx_abc123 --name "My Snapshot" --description "Initial setup"'
			),
			description: 'Create a named snapshot with description',
		},
		{
			command: getCommand('cloud sandbox snapshot create sbx_abc123 --public'),
			description: 'Create a public snapshot',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID to snapshot'),
		}),
		options: z.object({
			name: z
				.string()
				.optional()
				.describe('Display name for the snapshot (letters, numbers, underscores, dashes only)'),
			description: z.string().optional().describe('Description of the snapshot'),
			tag: z.string().optional().describe('Tag for the snapshot (defaults to "latest")'),
			public: z
				.boolean()
				.optional()
				.default(false)
				.describe('Make the snapshot publicly accessible'),
		}),
		response: SnapshotCreateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, orgId, config } = ctx;

		if (opts.name && !SNAPSHOT_NAME_REGEX.test(opts.name)) {
			logger.fatal(
				'Invalid snapshot name: must only contain letters, numbers, underscores, and dashes'
			);
		}

		if (opts.tag) {
			if (opts.tag.length > MAX_SNAPSHOT_TAG_LENGTH) {
				logger.fatal(
					`Invalid snapshot tag: must be at most ${MAX_SNAPSHOT_TAG_LENGTH} characters`
				);
			}
			if (!SNAPSHOT_TAG_REGEX.test(opts.tag)) {
				logger.fatal(
					'Invalid snapshot tag: must only contain letters, numbers, dashes, underscores, and dots, and cannot start with a period or dash'
				);
			}
		}

		const profileName = config?.name;
		const region = await getSandboxRegion(
			logger,
			auth,
			profileName,
			args.sandboxId,
			orgId,
			config
		);
		const client = createSandboxClient(logger, auth, region);

		const snapshot = await snapshotCreate(client, {
			sandboxId: args.sandboxId,
			name: opts.name,
			description: opts.description,
			tag: opts.tag,
			public: opts.public,
			orgId,
		});

		if (!options.json) {
			tui.success(`Created snapshot ${tui.bold(snapshot.snapshotId)}`);
			console.log('');

			tui.table(
				[
					{
						Name: snapshot.name,
						Description: snapshot.description ?? '-',
						Tag: snapshot.tag ?? 'latest',
						Size: tui.formatBytes(snapshot.sizeBytes),
						Files: snapshot.fileCount.toFixed(),
						Visibility: snapshot.public ? 'public' : 'private',
						Created: snapshot.createdAt,
					},
				],
				['Name', 'Description', 'Tag', 'Size', 'Files', 'Visibility', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return {
			snapshotId: snapshot.snapshotId,
			name: snapshot.name,
			description: snapshot.description ?? undefined,
			tag: snapshot.tag ?? undefined,
			sizeBytes: snapshot.sizeBytes,
			fileCount: snapshot.fileCount,
			createdAt: snapshot.createdAt,
		};
	},
});

export default createSubcommand;
