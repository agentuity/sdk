import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { isPossiblyJSON } from '../../json';
import { createStorageAdapter } from './util';

export const setSubcommand = createCommand({
	name: 'set',
	aliases: ['put'],
	description: 'Set a key and value in the keyvalue storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			namespace: z.string().min(1),
			key: z.string().min(1),
			value: z.string().min(1),
			ttl: z.coerce.number().min(60).optional(),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const contentType = isPossiblyJSON(args.value) ? 'application/json' : 'text/plain';
		const ttl = args.ttl;
		await storage.set(args.namespace, args.key, args.value, {
			contentType,
			ttl,
		});
		tui.success(`saved in ${(Date.now() - started).toFixed(1)}ms (${contentType})`);
	},
});

export default setSubcommand;
