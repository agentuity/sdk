import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createCadenceKVAdapter, CADENCE_NAMESPACE, getLoopStateKey, parseLoopState } from './util';
import { getCommand } from '../../../command-prefix';

const CadenceStatusResponseSchema = z.object({
	found: z.boolean(),
	loop: z
		.object({
			loopId: z.string(),
			status: z.string(),
			iteration: z.number(),
			maxIterations: z.number(),
			prompt: z.string(),
			projectLabel: z.string().optional(),
			sessionId: z.string().optional(),
			createdAt: z.string(),
			updatedAt: z.string(),
			lastError: z.string().optional(),
		})
		.optional(),
});

export const statusSubcommand = createCommand({
	name: 'status',
	aliases: ['get', 'show'],
	description: 'Get status of a Cadence loop',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cadence status lp_auth_impl'), description: 'Get loop status' },
	],
	schema: {
		args: z.object({
			loopId: z.string().min(1).describe('The loop ID (e.g., lp_auth_impl)'),
		}),
		response: CadenceStatusResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const kv = await createCadenceKVAdapter(ctx);

		const key = getLoopStateKey(args.loopId);
		const result = await kv.get(CADENCE_NAMESPACE, key);

		if (!result.exists || !result.data) {
			if (!options.json) {
				tui.warning(`Loop ${args.loopId} not found.`);
			}
			return { found: false };
		}

		let data: unknown;
		if (typeof result.data === 'string') {
			try {
				data = JSON.parse(result.data);
			} catch {
				if (!options.json) {
					tui.error(`Failed to parse loop state for ${args.loopId}`);
				}
				return { found: false };
			}
		} else {
			data = result.data;
		}

		const loop = parseLoopState(data);
		if (!loop) {
			if (!options.json) {
				tui.error(`Invalid loop state for ${args.loopId}`);
			}
			return { found: false };
		}

		if (!options.json) {
			console.log();
			tui.info(`Cadence Loop: ${tui.colorPrimary(loop.loopId)}`);
			console.log();

			const details = [
				['Status', formatStatus(loop.status)],
				['Iteration', `${loop.iteration} / ${loop.maxIterations}`],
				['Project', loop.projectLabel ?? '-'],
				['Session', loop.sessionId ?? '-'],
				['Created', loop.createdAt],
				['Updated', loop.updatedAt],
			];

			if (loop.lastError) {
				details.push(['Last Error', tui.colorError(loop.lastError)]);
			}

			for (const [label, value] of details) {
				console.log(`  ${tui.muted(label + ':')} ${value}`);
			}

			console.log();
			console.log(tui.muted('Task:'));
			console.log(`  ${loop.prompt}`);
			console.log();
		}

		return {
			found: true,
			loop: {
				loopId: loop.loopId,
				status: loop.status,
				iteration: loop.iteration,
				maxIterations: loop.maxIterations,
				prompt: loop.prompt,
				projectLabel: loop.projectLabel,
				sessionId: loop.sessionId,
				createdAt: loop.createdAt,
				updatedAt: loop.updatedAt,
				lastError: loop.lastError,
			},
		};
	},
});

function formatStatus(status: string): string {
	switch (status) {
		case 'running':
			return tui.colorSuccess('● running');
		case 'paused':
			return tui.colorWarning('⏸ paused');
		case 'completed':
			return tui.colorSuccess('✓ completed');
		case 'failed':
			return tui.colorError('✗ failed');
		case 'cancelled':
			return tui.muted('○ cancelled');
		default:
			return status;
	}
}

export default statusSubcommand;
