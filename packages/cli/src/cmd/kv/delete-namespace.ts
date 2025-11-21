import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const deleteNamespaceSubcommand = createCommand({
	name: 'delete-namespace',
	aliases: ['rm-namespace'],
	description: 'Delete a keyvalue namespace and all its keys',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			name: z.string().min(1).max(64).describe('the namespace name'),
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('if true will not prompt for confirmation'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		if (!args.confirm) {
			if (!process.stdin.isTTY) {
				tui.fatal('No TTY and --confirm is not set. Refusing to delete');
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
				return;
			}
		}

		await kv.deleteNamespace(args.name);
		tui.success(`Namespace ${tui.bold(args.name)} deleted`);
	},
});

export default deleteNamespaceSubcommand;
