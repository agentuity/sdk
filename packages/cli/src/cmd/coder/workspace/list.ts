import { z } from 'zod';
import {
	CoderClient,
	type CoderWorkspaceDetail,
	CoderWorkspaceDetailSchema,
} from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

function formatRelativeTime(isoDate: string): string {
	const parsed = new Date(isoDate).getTime();
	if (Number.isNaN(parsed)) return 'unknown';
	const diffMs = Math.max(0, Date.now() - parsed);
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List Coder workspaces',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace list'),
			description: 'List Coder workspaces',
		},
		{
			command: getCommand('coder workspace list --json'),
			description: 'Return workspaces as JSON',
		},
	],
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
		response: z.array(CoderWorkspaceDetailSchema),
	},
	async handler(ctx) {
		const { options, opts } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let workspaces: CoderWorkspaceDetail[] = [];
		try {
			const response = await client.listWorkspaces();
			workspaces = response.workspaces;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to list Coder workspaces: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return workspaces;
		}

		if (workspaces.length === 0) {
			tui.info('No Coder workspaces found.');
			return [];
		}

		tui.table(
			workspaces.map((w) => ({
				ID: w.id,
				Name: w.name,
				Scope: w.scope,
				Repos: String(w.repoCount),
				Skills: String(w.selectionCount),
				Created: formatRelativeTime(w.createdAt),
			})),
			[
				{ name: 'ID', alignment: 'left' },
				{ name: 'Name', alignment: 'left' },
				{ name: 'Scope', alignment: 'center' },
				{ name: 'Repos', alignment: 'right' },
				{ name: 'Skills', alignment: 'right' },
				{ name: 'Created', alignment: 'right' },
			]
		);

		return workspaces;
	},
});
