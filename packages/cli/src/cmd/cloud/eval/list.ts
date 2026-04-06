import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { evalList } from '@agentuity/server';

const EvalListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Eval ID'),
		name: z.string().describe('Eval name'),
		identifier: z.string().nullable().describe('Stable eval identifier'),
		agent_identifier: z.string().describe('Agent identifier'),
		created_at: z.string().describe('Creation timestamp'),
		updated_at: z.string().describe('Last updated timestamp'),
		project_id: z.string().describe('Project ID'),
		description: z.string().nullable().describe('Eval description'),
		devmode: z.boolean().describe('Whether this is a devmode eval'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List evals',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud eval list'), description: 'List 10 most recent evals' },
		{
			command: getCommand('cloud eval list --count=25'),
			description: 'List 25 most recent evals',
		},
		{
			command: getCommand('cloud eval list --project-id=proj_*'),
			description: 'Filter by project',
		},
		{
			command: getCommand('cloud eval list --agent-id=agent_*'),
			description: 'Filter by agent',
		},
		{
			command: getCommand('cloud eval list --all'),
			description: 'List all evals regardless of project context',
		},
	],
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
			orgId: z.string().optional().describe('filter by organization id'),
			count: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(10)
				.describe('Number of evals to list (1–100)'),
			projectId: z.string().optional().describe('Filter by project ID'),
			agentId: z.string().optional().describe('Filter by agent ID'),
			all: z.boolean().optional().describe('List all evals regardless of project context'),
		}),
		response: EvalListResponseSchema,
	},
	webUrl: (ctx) => {
		const projectId = ctx.opts?.all ? undefined : ctx.opts?.projectId || ctx.project?.projectId;
		return projectId ? `/projects/${encodeURIComponent(projectId)}/evals` : undefined;
	},
	async handler(ctx) {
		const { apiClient, project, opts, options } = ctx;

		if (opts?.orgId && opts?.projectId) {
			tui.fatal('--org-id and --project-id are mutually exclusive. Use one or the other.');
		}

		const projectId = opts.all || opts.orgId ? undefined : opts.projectId || project?.projectId;

		try {
			const evals = await evalList(apiClient, {
				orgId: opts?.orgId,
				projectId,
				agentId: opts.agentId,
			});

			const result = evals.map((e) => ({
				id: e.id,
				name: e.name,
				identifier: e.identifier,
				agent_identifier: e.agentIdentifier,
				created_at: e.createdAt,
				updated_at: e.updatedAt,
				project_id: e.projectId,
				description: e.description,
				devmode: e.devmode,
			}));

			if (options.json) {
				return result;
			}

			if (evals.length === 0) {
				tui.info('No evals found.');
				return [];
			}

			const tableData = evals.map((e) => ({
				ID: e.id,
				Name: e.name.length > 30 ? e.name.substring(0, 27) + '...' : e.name,
				Agent: e.agentIdentifier || '-',
				Devmode: e.devmode ? '✓' : '✗',
				Created: new Date(e.createdAt).toLocaleString(),
			}));

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Name', alignment: 'left' },
				{ name: 'Agent', alignment: 'left' },
				{ name: 'Devmode', alignment: 'center' },
				{ name: 'Created', alignment: 'left' },
			]);

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list evals: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
