import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types.ts';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';

export const archiveSubcommand = createSubcommand({
	name: 'archive',
	description: 'Archive a Coder session',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder archive codesess_abc123'),
			description: 'Archive a session',
		},
		{
			command: getCommand('coder archive codesess_abc123 --json'),
			description: 'Archive a session and return JSON output',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to archive'),
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
			const session = await client.archiveSession(args.sessionId);
			const result = session ?? { archived: true, sessionId: args.sessionId };

			if (options.json) {
				return result;
			}

			tui.success(`Session ${args.sessionId} archived.`);
			return result;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to archive session ${args.sessionId}: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
