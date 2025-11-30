import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const KVSearchResponseSchema = z.object({
	namespace: z.string().describe('Namespace name'),
	keyword: z.string().describe('Search keyword used'),
	results: z.array(
		z.object({
			key: z.string().describe('Key name'),
			size: z.number().describe('Size in bytes'),
			contentType: z.string().describe('Content type'),
			updatedAt: z.string().describe('Last updated timestamp'),
		})
	),
});

export const searchSubcommand = createCommand({
	name: 'search',
	description: 'Search for keys matching a keyword in a keyvalue namespace',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('kv search production user'),
			description: 'Find all user-related keys',
		},
		{
			command: getCommand('kv search cache session'),
			description: 'Find all session keys in cache',
		},
		{ command: getCommand('kv search staging config'), description: 'Find all config keys' },
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the namespace name'),
			keyword: z.string().min(1).describe('keyword to use for filtering'),
		}),
		response: KVSearchResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const kv = await createStorageAdapter(ctx);

		const results = await kv.search(args.name, args.keyword);
		const keys = Object.keys(results);

		if (!options.json) {
			if (keys.length === 0) {
				tui.info(`No keys found matching ${tui.bold(args.keyword)} in ${tui.bold(args.name)}`);
			} else {
				tui.info(`Found ${keys.length} key(s) matching ${tui.bold(args.keyword)}:`);
				for (const key of keys) {
					const item = results[key];
					if (!item) continue;
					const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
					const date = new Date(item.updated_at).toLocaleString();
					tui.info(`  ${tui.bold(key)}: ${sizeMB} MB, ${item.contentType}, updated ${date}`);
				}
			}
		}

		return {
			namespace: args.name,
			keyword: args.keyword,
			results: keys.map((key) => {
				const item = results[key]!;
				return {
					key,
					size: item.size,
					contentType: item.contentType,
					updatedAt: item.updated_at,
				};
			}),
		};
	},
});

export default searchSubcommand;
