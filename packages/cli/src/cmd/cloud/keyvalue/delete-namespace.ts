import { z } from 'zod';
import { createCommand } from '../../../types';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

export const deleteNamespaceSubcommand = createCommand({
	name: 'delete-namespace',
	aliases: ['rm-namespace'],
	description: 'Delete a keyvalue namespace and all its keys',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv delete-namespace staging')} - Delete staging namespace (interactive)`,
		`${getCommand('kv rm-namespace cache --confirm')} - Delete cache without confirmation`,
		`${getCommand('kv delete-namespace production --confirm')} - Force delete production`,
	],
	schema: {
		args: z.object({
			name: z.string().min(1).max(64).describe('the namespace name'),
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
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		if (!args.confirm) {
			if (!process.stdin.isTTY) {
				tui.fatal(
					'No TTY and --confirm is not set. Refusing to delete',
					ErrorCode.VALIDATION_FAILED
				);
			}
			tui.warning(`This will delete namespace ${tui.bold(args.name)} and ALL its keys.`);
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

		await kv.deleteNamespace(args.name);
		tui.success(`Namespace ${tui.bold(args.name)} deleted`);

		return {
			success: true,
			namespace: args.name,
			message: `Namespace ${args.name} deleted`,
		};
	},
});

export default deleteNamespaceSubcommand;
