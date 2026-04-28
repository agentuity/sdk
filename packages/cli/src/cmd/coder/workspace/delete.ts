import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';

export const deleteWorkspaceSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove'],
	description: 'Delete a Coder workspace',
	tags: ['destructive', 'deletes-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace delete ws_abc123'),
			description: 'Delete a workspace',
		},
		{
			command: getCommand('coder workspace delete ws_abc123 --json'),
			description: 'Delete a workspace and return JSON output',
		},
	],
	schema: {
		args: z.object({
			workspaceId: z.string().describe('Workspace ID to delete'),
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
			const confirmed = await tui.confirm(`Delete workspace ${args.workspaceId}?`, false);
			if (!confirmed) {
				tui.info('Cancelled.');
				return { deleted: false, workspaceId: args.workspaceId };
			}
		}

		try {
			await client.deleteWorkspace(args.workspaceId);
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Failed to delete workspace ${args.workspaceId}: ${msg}`,
				ErrorCode.NETWORK_ERROR
			);
		}

		if (options.json) {
			return { deleted: true, workspaceId: args.workspaceId };
		}

		tui.success(`Workspace ${args.workspaceId} deleted.`);
		return { deleted: true, workspaceId: args.workspaceId };
	},
});
