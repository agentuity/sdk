import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

export const loopSubcommand = createSubcommand({
	name: 'loop',
	description: 'Get loop-mode state for a Coder session',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder loop codesess_abc123'),
			description: 'Show loop state for a session',
		},
		{
			command: getCommand('coder loop codesess_abc123 --json'),
			description: 'Get loop state as JSON',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to inspect loop state for'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		try {
			const state = await client.getLoopState(args.sessionId);

			if (options.json) {
				return state;
			}

			const rows: Array<{ Field: string; Value: string }> = [
				{ Field: 'Session ID', Value: state.sessionId },
				{ Field: 'Workflow Mode', Value: state.workflowMode },
			];

			if (!state.loop) {
				rows.push({ Field: 'Loop Status', Value: 'not active' });
			} else {
				rows.push({ Field: 'Loop Status', Value: state.loop.status });
				rows.push({ Field: 'Iteration', Value: String(state.loop.iteration) });
				rows.push({
					Field: 'Max Iterations',
					Value: String(state.loop.maxIterations ?? '-'),
				});
				rows.push({ Field: 'Goal', Value: state.loop.goal ?? '-' });
				rows.push({ Field: 'Summary', Value: state.loop.summary ?? '-' });
				rows.push({ Field: 'Next Action', Value: state.loop.nextAction ?? '-' });
			}

			tui.table(rows, [
				{ name: 'Field', alignment: 'left' },
				{ name: 'Value', alignment: 'left' },
			]);

			return state;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Failed to get loop state for ${args.sessionId}: ${msg}`,
				ErrorCode.NETWORK_ERROR
			);
		}
	},
});
