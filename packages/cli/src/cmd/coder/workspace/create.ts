import { z } from 'zod';
import { APIError, ValidationInputError, ValidationOutputError } from '@agentuity/core';
import {
	CoderClient,
	CoderCreateWorkspaceRequestSchema,
	type CoderCreateWorkspaceRequest,
} from '@agentuity/core/coder';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveGitHubRepo } from '../resolve-repo';
import {
	EMPTY_WORKSPACE_ERROR,
	formatWorkspaceValidationMessage,
	hasWorkspaceSelections,
	parseCommaList,
	printWorkspaceSummary,
	readSetupScript,
} from './common';

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
				'coder workspace create "My Workspace" --dependency git --setup-script-file ./setup.sh --scope org'
			),
			description: 'Create an org-scoped workspace with dependencies and a setup script',
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
			dependency: z
				.string()
				.optional()
				.describe('Comma-separated APT dependencies to install into workspace snapshots'),
			setupScript: z
				.string()
				.optional()
				.describe('Inline shell script to run while preparing workspace snapshots'),
			setupScriptFile: z
				.string()
				.optional()
				.describe('Path to a shell script to run while preparing workspace snapshots'),
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
		if (opts?.dependency) {
			body.dependencies = parseCommaList(opts.dependency);
		}
		try {
			const setupScript = await readSetupScript({
				setupScript: opts?.setupScript,
				setupScriptFile: opts?.setupScriptFile,
			});
			if (setupScript !== undefined) body.setupScript = setupScript;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to read setup script: ${msg}`, ErrorCode.VALIDATION_FAILED);
			return;
		}
		if (opts?.enabledAgents) {
			body.enabledAgents = parseCommaList(opts.enabledAgents);
		}
		if (!hasWorkspaceSelections(body)) {
			tui.fatal(
				`Failed to create workspace: ${EMPTY_WORKSPACE_ERROR}. Use --repo, --dependency, --setup-script, or --enabled-agents.`,
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

			if (options.json) {
				return created;
			}

			tui.success(`Workspace ${created.id} created.`);
			tui.newline();
			printWorkspaceSummary(created);

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
