import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const createNamespaceSubcommand = createCommand({
	name: 'create-namespace',
	aliases: ['create'],
	description: 'Create a new keyvalue namespace',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			name: z.string().min(1).max(64).describe('the namespace name'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		await kv.createNamespace(args.name);
		tui.success(`Namespace ${tui.bold(args.name)} created`);
	},
});

export default createNamespaceSubcommand;
