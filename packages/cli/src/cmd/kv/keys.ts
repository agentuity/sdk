import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

const KVKeysResponseSchema = z.object({
	namespace: z.string().describe('Namespace name'),
	keys: z.array(z.string()).describe('List of keys in the namespace'),
});

export const keysSubcommand = createCommand({
	name: 'keys',
	aliases: ['ls', 'list'],
	description: 'List all keys in a keyvalue namespace',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('kv keys production')} - List all keys in production`,
		`${getCommand('kv ls cache')} - List all cached keys (using alias)`,
		`${getCommand('kv list staging')} - List all staging keys`,
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the namespace name'),
		}),
		response: KVKeysResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		const keys = await kv.getKeys(args.name);

		if (keys.length === 0) {
			tui.info(`No keys found in namespace ${tui.bold(args.name)}`);
			return {
				namespace: args.name,
				keys: [],
			};
		}

		tui.info(`Found ${keys.length} key(s) in ${tui.bold(args.name)}:`);
		for (const key of keys) {
			tui.info(`  ${key}`);
		}

		return {
			namespace: args.name,
			keys,
		};
	},
});

export default keysSubcommand;
