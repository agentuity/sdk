import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const listKeysSubcommand = createCommand({
	name: 'list-keys',
	aliases: ['ls', 'list'],
	description: 'List all keys in an object storage bucket',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const objectStore = await createStorageAdapter(ctx);

		const objects = await objectStore.listKeys(args.bucket);

		if (objects.length === 0) {
			tui.info(`No objects found in bucket ${tui.bold(args.bucket)}`);
			return;
		}

		tui.info(`Found ${objects.length} object(s) in ${tui.bold(args.bucket)}:`);
		for (const obj of objects) {
			const sizeMB = (obj.size / (1024 * 1024)).toFixed(2);
			const date = new Date(obj.updated_at).toLocaleString();
			tui.info(`  ${tui.bold(obj.key)}: ${sizeMB} MB, updated ${date}`);
		}
	},
});

export default listKeysSubcommand;
