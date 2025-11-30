import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
export const deleteBucketSubcommand = createCommand({
	name: 'delete-bucket',
	description: 'Delete an object storage bucket and all its contents',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		{
			command: getCommand('objectstore delete-bucket temp'),
			description: 'Delete temp bucket (interactive)',
		},
		{
			command: getCommand('objectstore delete-bucket old-uploads --confirm'),
			description: 'Force delete without confirmation',
		},
	],
	schema: {
		args: z.object({
			bucket: z.string().min(1).max(64).describe('the name of the bucket'),
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('if true will not prompt for confirmation'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the deletion succeeded'),
			bucket: z.string().describe('Deleted bucket name'),
			message: z.string().optional().describe('Confirmation message'),
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
				return { success: false, bucket: args.bucket, message: 'Cancelled' };
			}
		}

		const deleted = await objectStore.deleteBucket(args.bucket);

		if (deleted) {
			tui.success(`Bucket ${tui.bold(args.bucket)} deleted`);
		} else {
			tui.error(`Bucket ${tui.bold(args.bucket)} not found`);
		}

		return {
			success: deleted,
			bucket: args.bucket,
			message: deleted ? `Bucket ${args.bucket} deleted` : `Bucket ${args.bucket} not found`,
		};
	},
});

export default deleteBucketSubcommand;
