import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const BucketListResponseSchema = z.array(
	z.object({
		name: z.string().describe('Bucket name'),
		object_count: z.number().describe('Number of objects in bucket'),
		total_bytes: z.number().describe('Total size in bytes'),
	})
);

export const listBucketsSubcommand = createCommand({
	name: 'list-buckets',
	description: 'List all object storage buckets',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	schema: {
		response: BucketListResponseSchema,
	},
	idempotent: true,
	examples: [
		{
			command: getCommand('objectstore list-buckets'),
			description: 'List all buckets with stats',
		},
	],

	async handler(ctx) {
		const { options } = ctx;
		const storage = await createStorageAdapter(ctx);
		const buckets = await storage.listBuckets();

		if (!options.json) {
			if (buckets.length === 0) {
				tui.info('No buckets found');
			} else {
				tui.info(`Found ${buckets.length} bucket(s):`);
				for (const bucket of buckets) {
					const sizeMB = (bucket.total_bytes / (1024 * 1024)).toFixed(2);
					tui.info(`  ${tui.bold(bucket.name)}: ${bucket.object_count} objects, ${sizeMB} MB`);
				}
			}
		}

		return buckets;
	},
});

export default listBucketsSubcommand;
