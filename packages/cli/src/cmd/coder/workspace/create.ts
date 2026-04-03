import { z } from 'zod';
import { CoderClient, type CoderCreateWorkspaceRequest } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveGitHubRepo } from '../resolve-repo';

export const createWorkspaceSubcommand = createSubcommand({
	name: 'create',
	aliases: ['new', 'add'],
	description: 'Create a new Coder workspace',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace create "My Workspace"'),
			description: 'Create a workspace with a name',
		},
		{
			command: getCommand(
				'coder workspace create "My Workspace" --description "For frontend work" --scope org'
			),
			description: 'Create an org-scoped workspace with description',
		},
		{
			command: getCommand(
				'coder workspace create "My Workspace" --repo https://github.com/org/repo --repo-branch main'
			),
			description: 'Create a workspace with a repository',
		},
		{
			command: getCommand('coder workspace create "My Workspace" --json'),
			description: 'Create a workspace and return JSON output',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Workspace name'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			description: z.string().optional().describe('Workspace description'),
			scope: z.string().optional().describe('Workspace scope: user or org'),
			repo: z.string().optional().describe('Repository URL to add'),
			repoBranch: z.string().optional().describe('Branch for the repository'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		const body: CoderCreateWorkspaceRequest = {
			name: args.name,
			...(opts?.description && { description: opts.description }),
			...(opts?.scope && { scope: opts.scope as 'user' | 'org' }),
		};

		if (opts?.repo) {
			if (!options.json) tui.output('Resolving repository...');
			try {
				const resolved = await resolveGitHubRepo(client, opts.repo, opts?.repoBranch);
				body.repos = [resolved];
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Failed to resolve repository: ${msg}`, ErrorCode.VALIDATION_FAILED);
				return;
			}
		}

		try {
			const created = await client.createWorkspace(body);

			if (options.json) {
				return created;
			}

			tui.success(`Workspace ${created.id} created.`);
			tui.newline();
			tui.output(`  Name:        ${tui.bold(created.name)}`);
			if (created.description) {
				tui.output(`  Description: ${created.description}`);
			}
			tui.output(`  Scope:       ${created.scope}`);
			tui.output(`  Repos:       ${created.repoCount}`);
			tui.output(`  Skills:      ${created.selectionCount}`);

			return created;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to create workspace: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
