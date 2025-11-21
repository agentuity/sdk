import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const keysSubcommand = createCommand({
	name: 'keys',
	aliases: ['ls', 'list'],
	description: 'List all keys in a keyvalue namespace',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the namespace name'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		const keys = await kv.getKeys(args.name);

		if (keys.length === 0) {
			tui.info(`No keys found in namespace ${tui.bold(args.name)}`);
			return;
		}

		tui.info(`Found ${keys.length} key(s) in ${tui.bold(args.name)}:`);
		for (const key of keys) {
			tui.info(`  ${key}`);
		}
	},
});

export default keysSubcommand;
