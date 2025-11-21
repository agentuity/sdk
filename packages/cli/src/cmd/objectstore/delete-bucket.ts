import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const deleteBucketSubcommand = createCommand({
	name: 'delete-bucket',
	description: 'Delete an object storage bucket and all its contents',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			bucket: z.string().min(1).max(64).describe('the name of the bucket'),
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('if true will not prompt for confirmation'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const objectStore = await createStorageAdapter(ctx);

		if (!args.confirm) {
			if (!process.stdin.isTTY) {
				tui.fatal('No TTY and --confirm is not set. Refusing to delete');
			}
			tui.warning(`This will delete bucket ${tui.bold(args.bucket)} and ALL its contents.`);
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

		const deleted = await objectStore.deleteBucket(args.bucket);

		if (deleted) {
			tui.success(`Bucket ${tui.bold(args.bucket)} deleted`);
		} else {
			tui.error(`Bucket ${tui.bold(args.bucket)} not found`);
		}
	},
});

export default deleteBucketSubcommand;
