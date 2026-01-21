import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const EvalListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Eval ID'),
		name: z.string().describe('Eval name'),
		created_at: z.string().describe('Creation timestamp'),
		updated_at: z.string().describe('Last updated timestamp'),
		project_id: z.string().describe('Project ID'),
		description: z.string().nullable().describe('Eval description'),
		enabled: z.boolean().describe('Whether the eval is enabled'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
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
			command: getCommand('cloud eval list --enabled=true'),
			description: 'Only enabled evals',
		},
		{
			command: getCommand('cloud eval list --all'),
			description: 'List all evals regardless of project context',
		},
	],
	aliases: ['ls'],
	requires: { auth: true },
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
				.describe('Number of evals to list (1–100)'),
			projectId: z.string().optional().describe('Filter by project ID'),
			all: z.boolean().optional().describe('List all evals regardless of project context'),
			enabled: z.coerce.boolean().optional().describe('Filter by enabled status (true/false)'),
		}),
		response: EvalListResponseSchema,
	},
	webUrl: (ctx) => {
		const projectId = ctx.opts?.all ? undefined : ctx.opts?.projectId || ctx.project?.projectId;
		return projectId ? `/projects/${encodeURIComponent(projectId)}/evals` : undefined;
	},
	async handler(ctx) {
		const { logger, auth, project, opts, options, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const projectId = opts.all ? undefined : opts.projectId || project?.projectId;

		try {
			// TODO: Replace with actual API call once endpoint is provided
			// const evals = await evalList(catalystClient, {
			// 	count: opts.count,
			// 	projectId,
			// 	enabled: opts.enabled,
			// });
			const evals: Array<{
				id: string;
				name: string;
				created_at: string;
				updated_at: string;
				project_id: string;
				description: string | null;
				enabled: boolean;
			}> = [];

			const result = evals.map((e) => ({
				id: e.id,
				name: e.name,
				created_at: e.created_at,
				updated_at: e.updated_at,
				project_id: e.project_id,
				description: e.description,
				enabled: e.enabled,
			}));

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			if (evals.length === 0) {
				tui.info('No evals found.');
				return [];
			}

			const tableData = evals.map((e) => ({
				ID: e.id,
				Name: e.name.length > 30 ? e.name.substring(0, 27) + '...' : e.name,
				Description: e.description
					? e.description.length > 40
						? e.description.substring(0, 37) + '...'
						: e.description
					: '-',
				Enabled: e.enabled ? '✓' : '✗',
				Created: new Date(e.created_at).toLocaleString(),
			}));

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Name', alignment: 'left' },
				{ name: 'Description', alignment: 'left' },
				{ name: 'Enabled', alignment: 'center' },
				{ name: 'Created', alignment: 'left' },
			]);

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list evals: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
