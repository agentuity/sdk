import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const searchSubcommand = createCommand({
	name: 'search',
	description: 'Search for keys matching a keyword in a keyvalue namespace',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the namespace name'),
			keyword: z.string().min(1).describe('keyword to use for filtering'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		const results = await kv.search(args.name, args.keyword);
		const keys = Object.keys(results);

		if (keys.length === 0) {
			tui.info(`No keys found matching ${tui.bold(args.keyword)} in ${tui.bold(args.name)}`);
			return;
		}

		tui.info(`Found ${keys.length} key(s) matching ${tui.bold(args.keyword)}:`);
		for (const key of keys) {
			const item = results[key];
			if (!item) continue;
			const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
			const date = new Date(item.updated_at).toLocaleString();
			tui.info(`  ${tui.bold(key)}: ${sizeMB} MB, ${item.contentType}, updated ${date}`);
		}
	},
});

export default searchSubcommand;
