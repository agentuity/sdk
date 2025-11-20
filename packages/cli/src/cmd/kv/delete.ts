import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete a key from the keyvalue storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			namespace: z.string().min(1),
			key: z.string().min(1),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		await storage.delete(args.namespace, args.key);
		tui.success(`deleted in ${(Date.now() - started).toFixed(1)}ms`);
	},
});

export default deleteSubcommand;
