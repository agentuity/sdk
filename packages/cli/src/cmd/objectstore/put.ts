import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { isPossiblyJSON } from '../../json';
import { createStorageAdapter } from './util';

export const putSubcommand = createCommand({
	name: 'put',
	description: 'Put an object into the object storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1),
			key: z.string().min(1),
			value: z.string().min(1),
			contentType: z.string().optional(),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const contentType =
			args.contentType ?? (isPossiblyJSON(args.value) ? 'application/json' : 'text/plain');
		const data = new TextEncoder().encode(args.value);
		await storage.put(args.bucket, args.key, data, {
			contentType,
		});
		tui.success(`saved in ${(Date.now() - started).toFixed(1)}ms (${contentType})`);
	},
});

export default putSubcommand;
