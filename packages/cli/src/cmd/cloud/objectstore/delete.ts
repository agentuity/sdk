import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const ObjectStoreDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	bucket: z.string().describe('Bucket name'),
	key: z.string().describe('Object key'),
	deleted: z
		.boolean()
		.describe('Whether the object was actually deleted (false if it did not exist)'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete an object from the object storage',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		{
			command: getCommand('objectstore delete uploads images/old-logo.png'),
			description: 'Delete old logo',
		},
		{
			command: getCommand('objectstore rm assets data/temp.json'),
			description: 'Remove temp file (using alias)',
		},
		{
			command: getCommand('objectstore delete backups db-2023.sql'),
			description: 'Delete old backup',
		},
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1).describe('the bucket name'),
			key: z.string().min(1).describe('the key name'),
		}),
		response: ObjectStoreDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const deleted = await storage.delete(args.bucket, args.key);
		const durationMs = Date.now() - started;
		if (deleted) {
			tui.success(`deleted in ${durationMs.toFixed(1)}ms`);
		} else {
			tui.warning(`${args.key} did not exist in bucket ${args.bucket}`);
		}

		return {
			success: true,
			bucket: args.bucket,
			key: args.key,
			deleted,
			durationMs,
		};
	},
});

export default deleteSubcommand;
