import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';

export const deleteSkillSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete a saved skill from your library',
	tags: ['destructive', 'deletes-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder skill delete sk_abc123'),
			description: 'Delete a saved skill',
		},
		{
			command: getCommand('coder skill delete sk_abc123 --json'),
			description: 'Delete a saved skill and return JSON output',
		},
	],
	schema: {
		args: z.object({
			id: z.string().describe('Saved skill ID to delete'),
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
			const confirmed = await tui.confirm(`Delete saved skill ${args.id}?`, false);
			if (!confirmed) {
				tui.info('Cancelled.');
				return { deleted: false, id: args.id };
			}
		}

		try {
			await client.deleteSavedSkill(args.id);
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to delete saved skill ${args.id}: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return { deleted: true, id: args.id };
		}

		tui.success(`Saved skill ${args.id} deleted.`);
		return { deleted: true, id: args.id };
	},
});
