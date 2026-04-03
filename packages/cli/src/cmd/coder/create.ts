import { z } from 'zod';
import {
	CoderClient,
	type CoderCreateSessionRequest,
	normalizeVisibility,
} from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { toCoderHubWsUrl } from '../../coder-hub-url';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { resolveExtensionPath, resolveExtensionRuntimeModulePath } from './extension-path';
import { resolveGitHubRepo } from './resolve-repo';

export const createCoderSubcommand = createSubcommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new Coder session',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder create "Build a REST API"'),
			description: 'Create a simple session',
		},
		{
			command: getCommand('coder create "Fix the login bug" --repo https://github.com/org/repo'),
			description: 'Create with a repo',
		},
		{
			command: getCommand('coder create "Refactor auth" --connect'),
			description: 'Create and attach TUI',
		},
		{
			command: getCommand(
				'coder create "Build feature" --workflow-mode loop --loop-goal "Complete implementation" --loop-max-iterations 20'
			),
			description: 'Create a loop session',
		},
		{
			command: getCommand(
				'coder create "Quick task" --label "My Task" --tags frontend,urgent --json'
			),
			description: 'Create with label and tags, return JSON',
		},
	],
	schema: {
		args: z.object({
			task: z.string().describe('Task prompt for the session'),
		}),
		options: z.object({
			// Connection
			url: z.string().optional().describe('Coder API URL override'),
			connect: z.boolean().optional().describe('Connect to the session after creation'),
			extension: z
				.string()
				.optional()
				.describe('Coder extension path override (used with --connect)'),

			// Session config
			label: z.string().optional().describe('Human-readable session label'),
			agent: z.string().optional().describe('Default agent role (e.g. lead, scout)'),
			visibility: z
				.string()
				.optional()
				.describe('Session visibility: private, org, or collaborate'),

			// Workflow
			workflowMode: z.string().optional().describe('Workflow mode: standard or loop'),
			loopGoal: z.string().optional().describe('Goal for loop mode execution'),
			loopMaxIterations: z.number().optional().describe('Maximum loop iterations'),
			loopAutoContinue: z
				.boolean()
				.optional()
				.describe('Auto-continue loop without manual approval'),
			loopAllowDetached: z
				.boolean()
				.optional()
				.describe('Allow loop to continue when no client attached'),

			// Repository
			repo: z.string().optional().describe('Git repository URL to clone'),
			repoBranch: z.string().optional().describe('Branch to checkout for the repository'),

			// Resources
			workspaceId: z.string().optional().describe('Workspace ID to use'),
			tags: z.string().optional().describe('Comma-separated tags'),
			env: z
				.string()
				.optional()
				.describe('Environment variables as KEY=VALUE pairs, comma-separated'),

			// Skills (by ID for now)
			savedSkillIds: z.string().optional().describe('Comma-separated saved skill IDs'),
			skillBucketIds: z.string().optional().describe('Comma-separated skill bucket IDs'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		// Build the create session request body from flags
		const body: CoderCreateSessionRequest = {
			task: args.task,
			...(opts?.label && { label: opts.label }),
			...(opts?.agent && { agent: opts.agent }),
			...(opts?.visibility && { visibility: normalizeVisibility(opts.visibility) }),
			...(opts?.workflowMode && { workflowMode: opts.workflowMode as 'standard' | 'loop' }),
		};

		// Build loop config if any loop option is set
		if (
			opts?.loopGoal ||
			opts?.loopMaxIterations ||
			opts?.loopAutoContinue !== undefined ||
			opts?.loopAllowDetached !== undefined
		) {
			body.loop = {};
			if (opts?.loopGoal) body.loop.goal = opts.loopGoal;
			if (opts?.loopMaxIterations) body.loop.maxIterations = opts.loopMaxIterations;
			if (opts?.loopAutoContinue !== undefined) body.loop.autoContinue = opts.loopAutoContinue;
			if (opts?.loopAllowDetached !== undefined)
				body.loop.allowDetached = opts.loopAllowDetached;
			// Auto-set workflowMode to loop if loop options provided
			if (!body.workflowMode) body.workflowMode = 'loop';
		}

		// Parse repo
		if (opts?.repo) {
			if (!options.json) tui.output('Resolving repository...');
			try {
				const resolved = await resolveGitHubRepo(client, opts.repo, opts?.repoBranch);
				body.repo = resolved;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Failed to resolve repository: ${msg}`, ErrorCode.VALIDATION_FAILED);
				return;
			}
		}

		// Parse comma-separated values
		if (opts?.tags)
			body.tags = opts.tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
		if (opts?.savedSkillIds)
			body.savedSkillIds = opts.savedSkillIds
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		if (opts?.skillBucketIds)
			body.skillBucketIds = opts.skillBucketIds
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

		// Parse env vars: KEY=VALUE,KEY2=VALUE2
		if (opts?.env) {
			body.env = {};
			for (const pair of opts.env.split(',')) {
				const eq = pair.indexOf('=');
				if (eq > 0) {
					body.env[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
				}
			}
		}

		if (opts?.workspaceId) body.workspaceId = opts.workspaceId;

		// Create the session
		try {
			const created = await client.createSession(body);

			// JSON mode: return result and stop
			if (options.json) {
				return created;
			}

			tui.success(`Session ${created.sessionId} created (status: ${created.status})`);

			// If --connect, wait for provisioning then attach TUI
			if (opts?.connect) {
				tui.output('Waiting for session to provision...');

				// Poll until session is active
				let status = created.status;
				const startTime = Date.now();
				const POLL_TIMEOUT = 120_000;
				const POLL_INTERVAL = 3_000;

				while (Date.now() - startTime < POLL_TIMEOUT) {
					if (status !== 'creating' && status !== 'provisioning') break;
					await new Promise((r) => setTimeout(r, POLL_INTERVAL));
					try {
						const detail = await client.getSession(created.sessionId);
						status = detail.status;
					} catch {
						// Network blip — keep polling
					}
				}

				if (status !== 'active') {
					tui.fatal(
						`Session did not become active (status: ${status})`,
						ErrorCode.NETWORK_ERROR
					);
					return;
				}

				// Resolve extension and WS URL, then launch TUI
				const hubHttpUrl = await client.getUrl();
				const hubWsUrl = toCoderHubWsUrl(hubHttpUrl);

				const extensionPath = await resolveExtensionPath(opts?.extension);
				if (!extensionPath) {
					tui.fatal(
						'Could not find the Agentuity Coder extension.\n\nTry:\n  - Reinstall or update @agentuity/cli\n  - Install it locally: npm install @agentuity/coder-tui\n  - Set AGENTUITY_CODER_EXTENSION environment variable\n  - Pass --extension flag',
						ErrorCode.CONFIG_INVALID
					);
					return;
				}

				const remoteTuiPath = await resolveExtensionRuntimeModulePath(extensionPath);
				if (!remoteTuiPath) {
					tui.fatal(
						`Coder extension at ${extensionPath} is missing the remote TUI entrypoint`,
						ErrorCode.CONFIG_INVALID
					);
					return;
				}

				if (!options.json) {
					tui.newline();
					tui.output(`  Hub:       ${tui.bold(hubWsUrl)}`);
					tui.output(`  Extension: ${tui.bold(extensionPath)}`);
					tui.output(`  Session:   ${tui.bold(created.sessionId)}`);
					tui.newline();
				}

				try {
					const { runRemoteTui } = await import(remoteTuiPath);
					await runRemoteTui({
						hubWsUrl,
						sessionId: created.sessionId,
						apiKey: ctx.auth.apiKey,
						orgId: ctx.orgId,
					});
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					tui.fatal(`Remote TUI failed: ${msg}`, ErrorCode.NETWORK_ERROR);
				}
			}
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to create Coder session: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
