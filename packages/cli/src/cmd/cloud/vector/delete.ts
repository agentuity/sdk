import { z } from 'zod';
import { createCommand } from '../../../types';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const VectorDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	namespace: z.string().describe('Namespace name'),
	keys: z.array(z.string()).describe('Keys that were deleted'),
	deleted: z.number().describe('Number of vectors deleted'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	message: z.string().optional().describe('Confirmation message'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm'],
	description: 'Delete one or more vectors by key',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('vector delete products chair-001'),
			description: 'Delete a single vector (interactive)',
		},
		{
			command: getCommand('vector rm knowledge-base doc-123 doc-456 --confirm'),
			description: 'Delete multiple vectors without confirmation',
		},
		{
			command: getCommand('vector del embeddings old-profile-1 old-profile-2 --confirm'),
			description: 'Bulk delete without confirmation',
		},
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).describe('the vector storage namespace'),
			keys: z.array(z.string().min(1)).min(1).describe('one or more keys to delete'),
		}),
		options: z.object({
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('if true will not prompt for confirmation'),
		}),
		response: VectorDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options, opts } = ctx;

		if (!opts.confirm) {
			if (!process.stdin.isTTY) {
				tui.fatal(
					'No TTY and --confirm is not set. Refusing to delete',
					ErrorCode.VALIDATION_FAILED
				);
			}
			const keyList =
				args.keys.length > 3 ? `${args.keys.slice(0, 3).join(', ')}...` : args.keys.join(', ');
			tui.warning(
				`This will delete ${args.keys.length} vector(s) from ${tui.bold(args.namespace)}: ${keyList}`
			);
			const confirm = await new Promise<boolean>((resolve) => {
				process.stdout.write('Are you sure? (yes/no): ');
				process.stdin.once('data', (data) => {
					const answer = data.toString().trim().toLowerCase();
					resolve(answer === 'yes' || answer === 'y');
				});
			});

			if (!confirm) {
				tui.info('Cancelled');
				return {
					success: false,
					namespace: args.namespace,
					keys: args.keys,
					deleted: 0,
					durationMs: 0,
					message: 'Cancelled',
				};
			}
		}

		const storage = await createStorageAdapter(ctx);
		const started = Date.now();

		const deleted = await storage.delete(args.namespace, ...args.keys);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (deleted > 0) {
				tui.success(
					`Deleted ${deleted} vector(s) from ${tui.bold(args.namespace)} (${durationMs}ms)`
				);
			} else {
				tui.warning(
					`No vectors were deleted from ${tui.bold(args.namespace)} (keys may not exist)`
				);
			}
		}

		return {
			success: true,
			namespace: args.namespace,
			keys: args.keys,
			deleted,
			durationMs,
		};
	},
});

export default deleteSubcommand;
