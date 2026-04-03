import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

function formatRelativeTime(isoDate: string): string {
	const diffMs = Date.now() - new Date(isoDate).getTime();
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const getWorkspaceSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show', 'inspect'],
	description: 'Show detailed information about a Coder workspace',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace get ws_abc123'),
			description: 'Get a workspace by ID',
		},
		{
			command: getCommand('coder workspace get ws_abc123 --json'),
			description: 'Get workspace details as JSON',
		},
	],
	schema: {
		args: z.object({
			workspaceId: z.string().describe('Workspace ID to inspect'),
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

		let workspace;
		try {
			workspace = await client.getWorkspace(args.workspaceId);
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to get workspace ${args.workspaceId}: ${msg}`, ErrorCode.NETWORK_ERROR);
			return;
		}

		if (options.json) {
			return workspace;
		}

		tui.header(`Workspace: ${workspace.name}`);
		tui.newline();
		tui.output(`  ID:          ${workspace.id}`);
		tui.output(`  Name:        ${tui.bold(workspace.name)}`);
		if (workspace.description) {
			tui.output(`  Description: ${workspace.description}`);
		}
		tui.output(`  Scope:       ${workspace.scope}`);
		tui.output(`  Owner:       ${workspace.ownerUserId}`);
		tui.output(`  Created:     ${formatRelativeTime(workspace.createdAt)}`);
		tui.output(`  Updated:     ${formatRelativeTime(workspace.updatedAt)}`);
		tui.newline();

		if (workspace.repos.length > 0) {
			tui.output(`  Repositories (${workspace.repoCount}):`);
			for (const repo of workspace.repos) {
				const name = repo.fullName || repo.name || repo.url || repo.cloneUrl || 'unknown';
				const branch = repo.branch || repo.defaultBranch || '';
				tui.output(`    - ${name}${branch ? ` (${branch})` : ''}`);
			}
			tui.newline();
		}

		if (workspace.savedSkillIds.length > 0) {
			tui.output(`  Saved Skill IDs (${workspace.savedSkillIds.length}):`);
			for (const id of workspace.savedSkillIds) {
				tui.output(`    - ${id}`);
			}
			tui.newline();
		}

		if (workspace.skillBucketIds.length > 0) {
			tui.output(`  Skill Bucket IDs (${workspace.skillBucketIds.length}):`);
			for (const id of workspace.skillBucketIds) {
				tui.output(`    - ${id}`);
			}
			tui.newline();
		}

		return workspace;
	},
});
