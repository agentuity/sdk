import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import { createStorageAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';

export const deleteNamespaceSubcommand = createCommand({
	name: 'delete-namespace',
	aliases: ['rm-namespace', 'del-namespace', 'remove-namespace'],
	description: 'Delete a vector namespace and all its vectors',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('vector delete-namespace staging'),
			description: 'Delete staging namespace (interactive)',
		},
		{
			command: getCommand('vector rm-namespace cache --confirm'),
			description: 'Delete cache without confirmation',
		},
		{
			command: getCommand('vector delete-namespace old-data --confirm'),
			description: 'Force delete old-data namespace',
		},
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the namespace name to delete'),
		}),
		options: z.object({
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('if true will not prompt for confirmation'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the deletion succeeded'),
			namespace: z.string().describe('Deleted namespace name'),
			message: z.string().optional().describe('Confirmation message'),
		}),
	},

	async handler(ctx) {
		const { args, opts } = ctx;
		const storage = await createStorageAdapter(ctx);

		if (!opts.confirm) {
			if (!process.stdin.isTTY) {
				tui.fatal(
					'No TTY and --confirm is not set. Refusing to delete',
					ErrorCode.VALIDATION_FAILED
				);
			}
			tui.warning(
				`This will delete namespace ${tui.bold(args.name)} and ALL its vectors permanently.`
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
				return { success: false, namespace: args.name, message: 'Cancelled' };
			}
		}

		await storage.deleteNamespace(args.name);

		if (!ctx.options.json) {
			tui.success(`Namespace ${tui.bold(args.name)} deleted`);
		}

		return {
			success: true,
			namespace: args.name,
			message: `Namespace ${args.name} deleted`,
		};
	},
});

export default deleteNamespaceSubcommand;
