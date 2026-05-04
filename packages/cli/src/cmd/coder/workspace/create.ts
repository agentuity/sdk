import { z } from 'zod';
import { APIError, ValidationInputError, ValidationOutputError } from '@agentuity/core';
import {
	CoderClient,
	CoderCreateWorkspaceRequestSchema,
	type CoderCreateWorkspaceRequest,
} from '@agentuity/core/coder';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { resolveGitHubRepo } from '../resolve-repo.ts';

const EMPTY_WORKSPACE_ERROR =
	'A workspace needs at least one repo, saved skill, skill bucket, or agent';

function hasWorkspaceSelections(input: CoderCreateWorkspaceRequest): boolean {
	return (
		(input.repos?.length ?? 0) > 0 ||
		(input.savedSkillIds?.length ?? 0) > 0 ||
		(input.skillBucketIds?.length ?? 0) > 0 ||
		(input.enabledAgents?.length ?? 0) > 0
	);
}

function formatWorkspaceValidationMessage(issues: Array<{ message: string }>): string {
	const messages = [...new Set(issues.map((issue) => issue.message).filter(Boolean))];
	if (messages.length === 0) {
		return 'Invalid workspace configuration';
	}
	if (messages.includes(EMPTY_WORKSPACE_ERROR)) {
		return `${EMPTY_WORKSPACE_ERROR}. Use --repo or --enabled-agents.`;
	}
	return messages.join('; ');
}

export const createWorkspaceSubcommand = createSubcommand({
	name: 'create',
	aliases: ['new', 'add'],
	description: 'Create a new Coder workspace with at least one repo or agent',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand(
				'coder workspace create "My Workspace" --repo https://github.com/org/repo --repo-branch main'
			),
			description: 'Create a workspace with a repository',
		},
		{
			command: getCommand(
				'coder workspace create "My Workspace" --enabled-agents code-review --description "For frontend work" --scope org'
			),
			description: 'Create an org-scoped workspace with description and agents',
		},
		{
			command: getCommand('coder workspace create "My Workspace" --enabled-agents code-review'),
			description: 'Create a workspace with an agent roster',
		},
		{
			command: getCommand(
				'coder workspace create "My Workspace" --enabled-agents code-review --json'
			),
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
			enabledAgents: z
				.string()
				.optional()
				.describe('Comma-separated built-in/custom agents to include'),
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
		if (opts?.enabledAgents) {
			body.enabledAgents = opts.enabledAgents
				.split(',')
				.map((name) => name.trim())
				.filter(Boolean);
		}
		if (!hasWorkspaceSelections(body)) {
			tui.fatal(
				`Failed to create workspace: ${EMPTY_WORKSPACE_ERROR}. Use --repo or --enabled-agents.`,
				ErrorCode.VALIDATION_FAILED
			);
		}

		const validationResult = CoderCreateWorkspaceRequestSchema.safeParse(body);
		if (!validationResult.success) {
			ctx.logger.trace(
				'Validation issues: %s',
				JSON.stringify(validationResult.error.issues, null, 2)
			);
			tui.fatal(
				`Failed to create workspace: ${formatWorkspaceValidationMessage(validationResult.error.issues)}`,
				ErrorCode.VALIDATION_FAILED
			);
		}

		try {
			const created = await client.createWorkspace(validationResult.data);
			const createdEnabledAgents = Array.isArray(created.enabledAgents)
				? created.enabledAgents.filter((name): name is string => typeof name === 'string')
				: [];

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
			tui.output(`  Selections:  ${created.selectionCount}`);
			if (createdEnabledAgents.length > 0) {
				tui.output(`  Agents:      ${createdEnabledAgents.join(', ')}`);
			}

			return created;
		} catch (err) {
			if (err instanceof ValidationInputError || err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				tui.fatal(
					`Failed to create workspace: ${formatWorkspaceValidationMessage(err.issues)}`,
					ErrorCode.VALIDATION_FAILED
				);
			}
			if (err instanceof APIError && err.status >= 400 && err.status < 500) {
				tui.fatal(`Failed to create workspace: ${err.message}`, ErrorCode.VALIDATION_FAILED);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to create workspace: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
