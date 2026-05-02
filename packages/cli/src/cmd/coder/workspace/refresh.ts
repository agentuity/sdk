import { z } from 'zod';
import { APIError, ValidationOutputError } from '@agentuity/core';
import { CoderClient } from '@agentuity/core/coder';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { printWorkspaceSummary } from './common';

export const refreshWorkspaceSnapshotSubcommand = createSubcommand({
	name: 'refresh',
	aliases: ['snapshot-refresh', 'rebuild'],
	description: 'Refresh a Coder workspace snapshot',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace refresh ws_abc123'),
			description: 'Queue a workspace snapshot refresh',
		},
	],
	schema: {
		args: z.object({
			workspaceId: z.string().describe('Workspace ID to refresh'),
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
			const workspace = await client.refreshWorkspaceSnapshot(args.workspaceId);
			if (options.json) {
				return workspace;
			}

			tui.success(`Workspace ${workspace.id} snapshot refresh queued.`);
			tui.newline();
			printWorkspaceSummary(workspace);
			return workspace;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			if (err instanceof APIError && err.status >= 400 && err.status < 500) {
				tui.fatal(
					`Failed to refresh workspace snapshot: ${err.message}`,
					ErrorCode.VALIDATION_FAILED
				);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to refresh workspace snapshot: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
