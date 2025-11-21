import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete an object from the object storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1).describe('the bucket name'),
			key: z.string().min(1).describe('the key name'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const deleted = await storage.delete(args.bucket, args.key);
		if (deleted) {
			tui.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
		} else {
			tui.warning(`${args.key} did not exist in bucket ${args.bucket}`);
		}
	},
});

export default deleteSubcommand;
