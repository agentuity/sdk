import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const listBucketsSubcommand = createCommand({
	name: 'list-buckets',
	description: 'List all object storage buckets',
	requires: { auth: true, project: true },

	async handler(ctx) {
		const storage = await createStorageAdapter(ctx);
		const buckets = await storage.listBuckets();

		if (buckets.length === 0) {
			tui.info('No buckets found');
			return;
		}

		tui.info(`Found ${buckets.length} bucket(s):`);
		for (const bucket of buckets) {
			const sizeMB = (bucket.total_bytes / (1024 * 1024)).toFixed(2);
			tui.info(`  ${tui.bold(bucket.name)}: ${bucket.object_count} objects, ${sizeMB} MB`);
		}
	},
});

export default listBucketsSubcommand;
