import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const KVDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	namespace: z.string().describe('Namespace name'),
	key: z.string().describe('Key name'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete a key from the keyvalue storage',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv delete production user:123')} - Delete user data`,
		`${getCommand('kv delete cache session:abc')} - Delete cached session`,
		`${getCommand('kv rm staging cache:homepage')} - Delete homepage cache (using alias)`,
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the namespace name'),
			key: z.string().min(1).describe('the key name'),
		}),
		response: KVDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		await storage.delete(args.namespace, args.key);
		const durationMs = Date.now() - started;
		tui.success(`deleted in ${durationMs.toFixed(1)}ms`);

		return {
			success: true,
			namespace: args.namespace,
			key: args.key,
			durationMs,
		};
	},
});

export default deleteSubcommand;
