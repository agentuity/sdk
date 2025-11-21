import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const statsSubcommand = createCommand({
	name: 'stats',
	description: 'Get statistics for keyvalue storage',
	requires: { auth: true, project: true },
	schema: {
		args: z.object({
			name: z.string().optional().describe('the keyvalue namespace'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		const kv = await createStorageAdapter(ctx);

		if (args.name) {
			const stats = await kv.getStats(args.name);
			tui.info(`Statistics for ${tui.bold(args.name)}:`);
			tui.info(`  Keys: ${stats.count}`);
			const sizeDisplay =
				stats.sum < 1024 * 1024
					? `${stats.sum.toLocaleString()} bytes`
					: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
			tui.info(`  Total size: ${sizeDisplay} (raw: ${stats.sum})`);
			if (stats.createdAt) {
				tui.info(`  Created: ${new Date(stats.createdAt).toLocaleString()}`);
			}
			if (stats.lastUsedAt) {
				tui.info(`  Last used: ${new Date(stats.lastUsedAt).toLocaleString()}`);
			}
		} else {
			const allStats = await kv.getAllStats();
			const entries = Object.entries(allStats);

			if (entries.length === 0) {
				tui.info('No namespaces found');
				return;
			}

			tui.info(
				`Found ${entries.length} ${tui.plural(entries.length, 'namespace', 'namespaces')}:`
			);
			for (const [name, stats] of entries) {
				const sizeDisplay =
					stats.sum < 1024 * 1024
						? `${stats.sum.toLocaleString()} bytes`
						: `${(stats.sum / (1024 * 1024)).toFixed(2)} MB`;
				tui.arrow(`${tui.bold(name.padEnd(15, ' '))}: ${stats.count} keys, ${sizeDisplay}`);
			}
		}
	},
});

export default statsSubcommand;
