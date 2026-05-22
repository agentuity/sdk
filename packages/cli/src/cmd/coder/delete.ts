import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types.ts';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete a Coder session',
	tags: ['destructive', 'deletes-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder delete codesess_abc123'),
			description: 'Delete a session',
		},
		{
			command: getCommand('coder delete codesess_abc123 --json'),
			description: 'Delete a session and return JSON output',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to delete'),
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

		if (!options.json) {
			const confirmed = await tui.confirm(`Delete session ${args.sessionId}?`, false);
			if (!confirmed) {
				tui.info('Cancelled.');
				return { deleted: false, sessionId: args.sessionId };
			}
		}

		try {
			await client.deleteSession(args.sessionId);
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to delete session ${args.sessionId}: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return { deleted: true, sessionId: args.sessionId };
		}

		tui.success(`Session ${args.sessionId} deleted.`);
		return { deleted: true, sessionId: args.sessionId };
	},
});
