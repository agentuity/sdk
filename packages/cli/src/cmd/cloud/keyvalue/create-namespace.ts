import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

export const createNamespaceSubcommand = createCommand({
	name: 'create-namespace',
	aliases: ['create'],
	description: 'Create a new keyvalue namespace',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth'],
	idempotent: false,
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv create-namespace production')} - Create production namespace`,
		`${getCommand('kv create staging')} - Create staging namespace (using alias)`,
		`${getCommand('kv create cache')} - Create cache namespace`,
	],
	schema: {
		args: z.object({
			name: z.string().min(1).max(64).describe('the namespace name'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			namespace: z.string().describe('Namespace name'),
			message: z.string().optional().describe('Success message'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		await kv.createNamespace(args.name);
		tui.success(`Namespace ${tui.bold(args.name)} created`);

		return {
			success: true,
			namespace: args.name,
			message: `Namespace ${args.name} created`,
		};
	},
});

export default createNamespaceSubcommand;
