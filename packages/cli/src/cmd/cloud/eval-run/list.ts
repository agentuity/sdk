import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { evalRunList } from '@agentuity/server';

const EvalRunListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Eval run ID'),
		eval_id: z.string().describe('Eval ID'),
		session_id: z.string().describe('Session ID'),
		created_at: z.string().describe('Creation timestamp'),
		pending: z.boolean().describe('Whether the eval run is pending'),
		success: z.boolean().describe('Whether the eval run succeeded'),
		error: z.string().nullable().describe('Error message if failed'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List eval runs',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud eval-run list'), description: 'List 10 most recent eval runs' },
		{
			command: getCommand('cloud eval-run list --count=25'),
			description: 'List 25 most recent eval runs',
		},
		{
			command: getCommand('cloud eval-run list --eval-id=eval_*'),
			description: 'Filter by eval',
		},
		{
			command: getCommand('cloud eval-run list --session-id=sess_*'),
			description: 'Filter by session',
		},
		{
			command: getCommand('cloud eval-run list --project-id=proj_*'),
			description: 'Filter by project',
		},
		{
			command: getCommand('cloud eval-run list --success=true'),
			description: 'Only successful eval runs',
		},
		{
			command: getCommand('cloud eval-run list --pending=false'),
			description: 'Only completed eval runs',
		},
		{
			command: getCommand('cloud eval-run list --all'),
			description: 'List all eval runs regardless of project context',
		},
	],
	aliases: ['ls'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	pagination: {
		supported: true,
		defaultLimit: 10,
		maxLimit: 100,
		parameters: {
			limit: 'count',
		},
	},
	schema: {
		options: z.object({
			count: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(10)
				.describe('Number of eval runs to list (1–100)'),
			projectId: z.string().optional().describe('Filter by project ID'),
			all: z.boolean().optional().describe('List all eval runs regardless of project context'),
			evalId: z.string().optional().describe('Filter by eval ID'),
			agentId: z.string().optional().describe('Filter by agent ID'),
			sessionId: z.string().optional().describe('Filter by session ID'),
			success: z.coerce.boolean().optional().describe('Filter by success status (true/false)'),
			pending: z.coerce.boolean().optional().describe('Filter by pending status (true/false)'),
			startAfter: z.string().optional().describe('Filter by start time after (ISO 8601)'),
			startBefore: z.string().optional().describe('Filter by start time before (ISO 8601)'),
		}),
		response: EvalRunListResponseSchema,
	},
	webUrl: (ctx) => {
		const projectId = ctx.opts?.all ? undefined : ctx.opts?.projectId || ctx.project?.projectId;
		return projectId ? `/projects/${encodeURIComponent(projectId)}/eval-runs` : undefined;
	},
	async handler(ctx) {
		const { apiClient, project, opts, options } = ctx;

		const projectId = opts.all ? undefined : opts.projectId || project?.projectId;

		try {
			const evalRuns = await evalRunList(apiClient, {
				projectId,
				evalId: opts.evalId,
				sessionId: opts.sessionId,
				agentId: opts.agentId,
			});

			const result = evalRuns.map((r) => ({
				id: r.id,
				eval_id: r.evalId,
				eval_name: r.evalName,
				agent_identifier: r.agentIdentifier,
				session_id: r.sessionId,
				created_at: r.createdAt,
				pending: r.pending,
				success: r.success,
				error: r.error,
			}));

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			if (evalRuns.length === 0) {
				tui.info('No eval runs found.');
				return [];
			}

			const tableData = evalRuns.map((r) => ({
				ID: r.id,
				'Eval Name': r.evalName || '-',
				Agent: r.agentIdentifier || '-',
				Success: r.success ? '✓' : '✗',
				Pending: r.pending ? '⏳' : '✓',
				Error: r.error ? (r.error.length > 30 ? r.error.substring(0, 27) + '...' : r.error) : '-',
				Created: new Date(r.createdAt).toLocaleString(),
			}));

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Eval Name', alignment: 'left' },
				{ name: 'Agent', alignment: 'left' },
				{ name: 'Success', alignment: 'center' },
				{ name: 'Pending', alignment: 'center' },
				{ name: 'Error', alignment: 'left' },
				{ name: 'Created', alignment: 'left' },
			]);

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list eval runs: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
