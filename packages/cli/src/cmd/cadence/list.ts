import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import {
	createCadenceKVAdapter,
	CADENCE_NAMESPACE,
	LOOP_KEY_PREFIX,
	parseLoopState,
	type CadenceLoop,
} from './util';
import { getCommand } from '../../command-prefix';

const CadenceListResponseSchema = z.object({
	loops: z.array(
		z.object({
			loopId: z.string(),
			status: z.string(),
			iteration: z.number(),
			maxIterations: z.number(),
			prompt: z.string(),
			projectLabel: z.string().optional(),
			updatedAt: z.string(),
		})
	),
	count: z.number(),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List active Cadence loops',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cadence list'), description: 'List all Cadence loops' },
		{
			command: getCommand('cadence list --project github.com/org/repo'),
			description: 'List loops for a specific project',
		},
	],
	schema: {
		args: z.object({
			project: z.string().optional().describe('Filter by project label'),
		}),
		response: CadenceListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const kv = await createCadenceKVAdapter(ctx);

		// Search for loop keys - returns Record<key, item>
		const searchResult = await kv.search(CADENCE_NAMESPACE, LOOP_KEY_PREFIX);
		const allKeys = Object.keys(searchResult);
		const keys = allKeys.filter((k) => k.endsWith(':state'));

		const loops: CadenceLoop[] = [];

		// Fetch each loop's state from the search result or individually
		for (const key of keys) {
			const item = searchResult[key];
			let data: unknown;

			if (item && item.value) {
				// Use value from search result
				if (typeof item.value === 'string') {
					try {
						data = JSON.parse(item.value);
					} catch {
						continue;
					}
				} else {
					data = item.value;
				}
			} else {
				// Fallback to individual get
				const result = await kv.get(CADENCE_NAMESPACE, key);
				if (!result.exists || !result.data) continue;

				if (typeof result.data === 'string') {
					try {
						data = JSON.parse(result.data);
					} catch {
						continue;
					}
				} else {
					data = result.data;
				}
			}

			const loop = parseLoopState(data);
			if (loop) {
				// Filter by project if specified
				if (args.project && loop.projectLabel !== args.project) {
					continue;
				}
				loops.push(loop);
			}
		}

		// Sort by updatedAt descending
		loops.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

		if (!options.json) {
			if (loops.length === 0) {
				tui.info('No active Cadence loops found.');
			} else {
				console.log();
				tui.info(`Found ${loops.length} Cadence loop(s):`);
				console.log();

				const tableData = loops.map((loop) => ({
					'Loop ID': loop.loopId,
					Status: formatStatus(loop.status),
					Iteration: `${loop.iteration}/${loop.maxIterations}`,
					Task: truncate(loop.prompt, 40),
					Project: loop.projectLabel ?? '-',
					Updated: formatDate(loop.updatedAt),
				}));

				tui.table(tableData);
			}
		}

		return {
			loops: loops.map((loop) => ({
				loopId: loop.loopId,
				status: loop.status,
				iteration: loop.iteration,
				maxIterations: loop.maxIterations,
				prompt: loop.prompt,
				projectLabel: loop.projectLabel,
				updatedAt: loop.updatedAt,
			})),
			count: loops.length,
		};
	},
});

function formatStatus(status: string): string {
	switch (status) {
		case 'running':
			return tui.colorSuccess('running');
		case 'paused':
			return tui.colorWarning('paused');
		case 'completed':
			return tui.colorSuccess('completed');
		case 'failed':
			return tui.colorError('failed');
		case 'cancelled':
			return tui.muted('cancelled');
		default:
			return status;
	}
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.substring(0, maxLen - 3) + '...';
}

function formatDate(isoDate: string): string {
	try {
		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	} catch {
		return isoDate;
	}
}

export default listSubcommand;
