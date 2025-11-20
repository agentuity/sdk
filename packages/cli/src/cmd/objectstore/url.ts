import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const urlSubcommand = createCommand({
	name: 'url',
	aliases: ['publicurl', 'presigned'],
	description: 'Create a public URL for an object',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1),
			key: z.string().min(1),
			expires: z.coerce.number().min(60).optional(),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const url = await storage.createPublicURL(args.bucket, args.key, {
			expiresDuration: args.expires,
		});
		console.log(url);
		tui.success(`created in ${(Date.now() - started).toFixed(1)}ms`);
	},
});

export default urlSubcommand;
