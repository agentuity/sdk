import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

export const listKeysSubcommand = createCommand({
	name: 'list-keys',
	aliases: ['ls', 'list'],
	description: 'List all keys in an object storage bucket',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('objectstore list-keys uploads')} - List all uploaded files`,
		`${getCommand('objectstore ls assets')} - List assets (using alias)`,
		`${getCommand('objectstore list backups')} - List all backups`,
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1),
		}),
		response: z.object({
			bucket: z.string().describe('Bucket name'),
			objects: z
				.array(
					z.object({
						key: z.string().describe('Object key'),
						size: z.number().describe('Object size in bytes'),
						updated_at: z.string().describe('Last update timestamp'),
					})
				)
				.describe('List of objects in the bucket'),
			count: z.number().describe('Number of objects found'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const objectStore = await createStorageAdapter(ctx);

		const objects = await objectStore.listKeys(args.bucket);

		if (objects.length === 0) {
			tui.info(`No objects found in bucket ${tui.bold(args.bucket)}`);
			return { bucket: args.bucket, objects: [], count: 0 };
		}

		tui.info(`Found ${objects.length} object(s) in ${tui.bold(args.bucket)}:`);
		for (const obj of objects) {
			const sizeMB = (obj.size / (1024 * 1024)).toFixed(2);
			const date = new Date(obj.updated_at).toLocaleString();
			tui.info(`  ${tui.bold(obj.key)}: ${sizeMB} MB, updated ${date}`);
		}

		return { bucket: args.bucket, objects, count: objects.length };
	},
});

export default listKeysSubcommand;
