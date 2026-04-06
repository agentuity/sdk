import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

export const replaySubcommand = createSubcommand({
	name: 'replay',
	description: 'Get replay data for a Coder session',
	tags: ['read-only', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder replay codesess_abc123 --json'),
			description: 'Get replay data as JSON',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to get replay data for'),
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
			const replay = await client.getReplay(args.sessionId);

			if (!options.json) {
				tui.info('Replay data is shown as JSON because it is a complex payload.');
				tui.output(JSON.stringify(replay, null, 2));
			}

			return replay;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Failed to get replay for session ${args.sessionId}: ${msg}`,
				ErrorCode.NETWORK_ERROR
			);
		}
	},
});
