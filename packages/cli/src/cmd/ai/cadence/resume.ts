import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import {
	createCadenceKVAdapter,
	CADENCE_NAMESPACE,
	getLoopStateKey,
	parseLoopState,
	type CadenceLoop,
} from './util';
import { getCommand } from '../../../command-prefix';

const CadenceResumeResponseSchema = z.object({
	success: z.boolean(),
	loopId: z.string(),
	previousStatus: z.string().optional(),
	newStatus: z.string().optional(),
	message: z.string(),
});

export const resumeSubcommand = createCommand({
	name: 'resume',
	description: 'Resume a paused Cadence loop',
	tags: ['mutating', 'updates-resource', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cadence resume lp_auth_impl'), description: 'Resume a paused loop' },
	],
	schema: {
		args: z.object({
			loopId: z.string().min(1).describe('The loop ID to resume'),
		}),
		response: CadenceResumeResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const kv = await createCadenceKVAdapter(ctx);

		const key = getLoopStateKey(args.loopId);
		const result = await kv.get(CADENCE_NAMESPACE, key);

		if (!result.exists || !result.data) {
			if (!options.json) {
				tui.error(`Loop ${args.loopId} not found.`);
			}
			return {
				success: false,
				loopId: args.loopId,
				message: 'Loop not found',
			};
		}

		let data: unknown;
		if (typeof result.data === 'string') {
			try {
				data = JSON.parse(result.data);
			} catch {
				if (!options.json) {
					tui.error(`Failed to parse loop state for ${args.loopId}`);
				}
				return {
					success: false,
					loopId: args.loopId,
					message: 'Failed to parse loop state',
				};
			}
		} else {
			data = result.data;
		}

		const loop = parseLoopState(data);
		if (!loop) {
			if (!options.json) {
				tui.error(`Invalid loop state for ${args.loopId}`);
			}
			return {
				success: false,
				loopId: args.loopId,
				message: 'Invalid loop state',
			};
		}

		if (loop.status !== 'paused') {
			if (!options.json) {
				tui.warning(`Loop ${args.loopId} is not paused (status: ${loop.status})`);
			}
			return {
				success: false,
				loopId: args.loopId,
				previousStatus: loop.status,
				message: `Cannot resume loop with status: ${loop.status}`,
			};
		}

		// Update status to running
		const updatedLoop: CadenceLoop = {
			...loop,
			status: 'running',
			updatedAt: new Date().toISOString(),
		};

		await kv.set(CADENCE_NAMESPACE, key, JSON.stringify(updatedLoop), {
			contentType: 'application/json',
		});

		if (!options.json) {
			tui.success(`Resumed loop ${args.loopId}`);
			tui.info(
				'Note: The loop will continue when the Open Code session checks for status updates.'
			);
		}

		return {
			success: true,
			loopId: args.loopId,
			previousStatus: 'paused',
			newStatus: 'running',
			message: 'Loop resumed successfully',
		};
	},
});

export default resumeSubcommand;
