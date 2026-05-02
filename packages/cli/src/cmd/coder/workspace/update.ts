import { z } from 'zod';
import { APIError, ValidationInputError, ValidationOutputError } from '@agentuity/core';
import {
	CoderClient,
	CoderUpdateWorkspaceRequestSchema,
	type CoderUpdateWorkspaceRequest,
} from '@agentuity/core/coder';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveGitHubRepo } from '../resolve-repo';
import {
	formatWorkspaceValidationMessage,
	hasWorkspaceUpdate,
	parseCommaList,
	printWorkspaceSummary,
	readSetupScript,
} from './common';

export const updateWorkspaceSubcommand = createSubcommand({
	name: 'update',
	aliases: ['edit', 'patch'],
	description: 'Update a Coder workspace',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace update ws_abc123 --dependency git,nodejs'),
			description: 'Update workspace dependencies',
		},
		{
			command: getCommand('coder workspace update ws_abc123 --setup-script-file ./setup.sh'),
			description: 'Update the workspace setup script',
		},
	],
	schema: {
		args: z.object({
			workspaceId: z.string().describe('Workspace ID to update'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			name: z.string().optional().describe('Workspace name'),
			description: z.string().optional().describe('Workspace description'),
			scope: z.string().optional().describe('Workspace scope: user or org'),
			repo: z.string().optional().describe('Repository URL to set'),
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

		const body: CoderUpdateWorkspaceRequest = {
			...(opts?.name && { name: opts.name }),
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
		if (!hasWorkspaceUpdate(body)) {
			tui.fatal(
				'Failed to update workspace: At least one field must be provided.',
				ErrorCode.VALIDATION_FAILED
			);
		}

		const validationResult = CoderUpdateWorkspaceRequestSchema.safeParse(body);
		if (!validationResult.success) {
			ctx.logger.trace(
				'Validation issues: %s',
				JSON.stringify(validationResult.error.issues, null, 2)
			);
			tui.fatal(
				`Failed to update workspace: ${formatWorkspaceValidationMessage(validationResult.error.issues)}`,
				ErrorCode.VALIDATION_FAILED
			);
		}

		try {
			const updated = await client.updateWorkspace(args.workspaceId, validationResult.data);

			if (options.json) {
				return updated;
			}

			tui.success(`Workspace ${updated.id} updated.`);
			tui.newline();
			printWorkspaceSummary(updated);
			return updated;
		} catch (err) {
			if (err instanceof ValidationInputError || err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
				tui.fatal(
					`Failed to update workspace: ${formatWorkspaceValidationMessage(err.issues)}`,
					ErrorCode.VALIDATION_FAILED
				);
			}
			if (err instanceof APIError && err.status >= 400 && err.status < 500) {
				tui.fatal(`Failed to update workspace: ${err.message}`, ErrorCode.VALIDATION_FAILED);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to update workspace: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
