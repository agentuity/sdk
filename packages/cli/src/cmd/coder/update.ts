import { z } from 'zod';
import { CoderClient, normalizeVisibility } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

export const updateSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a Coder session',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true, org: true },
	aliases: ['set', 'edit'],
	examples: [
		{
			command: getCommand('coder update codesess_abc123 --label "New Label"'),
			description: 'Update the session label',
		},
		{
			command: getCommand('coder update codesess_abc123 --visibility org'),
			description: 'Make a session visible to the org',
		},
		{
			command: getCommand('coder update codesess_abc123 --tags "urgent,frontend"'),
			description: 'Update tags on a session',
		},
		{
			command: getCommand(
				'coder update codesess_abc123 --workflow-mode loop --loop-goal "Build it" --loop-max-iterations 20'
			),
			description: 'Switch a session to loop mode',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to update'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
			label: z.string().optional().describe('Updated session label'),
			agent: z.string().optional().describe('Updated default agent role'),
			visibility: z
				.string()
				.optional()
				.describe('Updated visibility: private, org, or collaborate'),
			workflowMode: z.string().optional().describe('Updated workflow mode: standard or loop'),
			loopGoal: z.string().optional().describe('Goal for loop mode'),
			loopMaxIterations: z.number().optional().describe('Maximum loop iterations'),
			loopAutoContinue: z.boolean().optional().describe('Auto-continue loop'),
			loopAllowDetached: z.boolean().optional().describe('Allow detached loop execution'),
			tags: z.string().optional().describe('Comma-separated tags (replaces existing)'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		const body: Record<string, unknown> = {};

		if (opts?.label) body.label = opts.label;
		if (opts?.agent) body.agent = opts.agent;
		if (opts?.visibility) body.visibility = normalizeVisibility(opts.visibility);
		if (opts?.workflowMode) body.workflowMode = opts.workflowMode;
		if (opts?.tags) {
			body.tags = opts.tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
		}

		if (
			opts?.loopGoal ||
			opts?.loopMaxIterations ||
			opts?.loopAutoContinue !== undefined ||
			opts?.loopAllowDetached !== undefined
		) {
			const loop: Record<string, unknown> = {};
			if (opts.loopGoal) loop.goal = opts.loopGoal;
			if (opts.loopMaxIterations) loop.maxIterations = opts.loopMaxIterations;
			if (opts.loopAutoContinue !== undefined) loop.autoContinue = opts.loopAutoContinue;
			if (opts.loopAllowDetached !== undefined) loop.allowDetached = opts.loopAllowDetached;
			body.loop = loop;
			if (!body.workflowMode) body.workflowMode = 'loop';
		}

		if (Object.keys(body).length === 0) {
			tui.fatal(
				'No update fields provided. Use --label, --visibility, --tags, --agent, --workflow-mode, or loop options.',
				ErrorCode.VALIDATION_FAILED
			);
		}

		try {
			const updated = await client.updateSession(args.sessionId, body as any);

			if (options.json) {
				return updated;
			}

			tui.success(`Session ${args.sessionId} updated.`);

			const fields: string[] = [];
			if (opts?.label) fields.push(`Label: ${opts.label}`);
			if (opts?.visibility) fields.push(`Visibility: ${body.visibility}`);
			if (opts?.tags) fields.push(`Tags: ${(body.tags as string[]).join(', ')}`);
			if (opts?.agent) fields.push(`Agent: ${opts.agent}`);
			if (opts?.workflowMode || body.loop) fields.push(`Workflow: ${body.workflowMode}`);

			for (const f of fields) {
				tui.output(`  ${f}`);
			}

			return updated;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to update session ${args.sessionId}: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
