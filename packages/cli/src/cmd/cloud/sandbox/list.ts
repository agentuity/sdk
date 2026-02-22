import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { cliSandboxList } from '@agentuity/server';

const SandboxInfoSchema = z.object({
	id: z.string().describe('Sandbox ID'),
	name: z.string().nullable().describe('Sandbox name'),
	description: z.string().nullable().describe('Sandbox description'),
	status: z.string().describe('Current status'),
	createdAt: z.string().nullable().describe('Creation timestamp'),
	region: z.string().nullable().describe('Region where sandbox is running'),
	orgId: z.string().describe('Organization ID'),
	orgName: z.string().nullable().describe('Organization name'),
	projectId: z.string().nullable().describe('Project ID'),
});

const SandboxListResponseSchema = z.object({
	sandboxes: z.array(SandboxInfoSchema).describe('List of sandboxes'),
	total: z.number().describe('Total count'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List sandboxes with optional filtering',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	pagination: {
		supported: true,
		defaultLimit: 50,
		maxLimit: 100,
		parameters: {
			limit: 'limit',
			offset: 'offset',
		},
	},
	examples: [
		{
			command: getCommand('cloud sandbox list'),
			description: 'List all sandboxes',
		},
		{
			command: getCommand('cloud sandbox list --status running'),
			description: 'List running sandboxes',
		},
		{
			command: getCommand('cloud sandbox list --project-id proj_123'),
			description: 'List sandboxes for a specific project',
		},
		{
			command: getCommand('cloud sandbox list --org-id org_123'),
			description: 'List sandboxes for a specific organization',
		},
		{
			command: getCommand('cloud sandbox list --limit 10 --offset 20'),
			description: 'List with pagination',
		},
		{
			command: getCommand('cloud sandbox list --all'),
			description: 'List all sandboxes regardless of project context',
		},
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Filter by sandbox name'),
			mode: z.enum(['oneshot', 'interactive']).optional().describe('Filter by sandbox mode'),
			status: z
				.enum([
					'creating',
					'idle',
					'running',
					'paused',
					'stopping',
					'suspended',
					'terminated',
					'failed',
				])
				.optional()
				.describe('Filter by status'),
			projectId: z.string().optional().describe('Filter by project ID'),
			orgId: z.string().optional().describe('Filter by organization ID'),
			all: z.boolean().optional().describe('List all sandboxes regardless of project context'),
			limit: z.number().min(0).default(50).describe('Maximum number of results (max: 100)'),
			offset: z.number().min(0).optional().describe('Pagination offset'),
			sort: z
				.enum(['name', 'created', 'updated', 'status', 'mode', 'execution_count'])
				.default('created')
				.describe('field to sort by'),
			direction: z.enum(['asc', 'desc']).default('desc').describe('sort direction'),
		}),
		response: SandboxListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, project, apiClient } = ctx;

		if (opts?.orgId && opts?.projectId) {
			tui.fatal('--org-id and --project-id are mutually exclusive. Use one or the other.');
		}

		const projectId = opts.all || opts.orgId ? undefined : opts.projectId || project?.projectId;

		const result = await cliSandboxList(apiClient, {
			name: opts.name,
			mode: opts.mode,
			projectId,
			orgId: opts.orgId,
			status: opts.status,
			limit: opts.limit,
			offset: opts.offset,
			sort: opts.sort,
			direction: opts.direction,
		});

		// Check if results span multiple orgs
		const uniqueOrgIds = new Set(result.sandboxes.map((s) => s.orgId));
		const showOrgColumn = uniqueOrgIds.size > 1;

		if (!options.json) {
			if (result.sandboxes.length === 0) {
				tui.info('No sandboxes found');
			} else {
				const tableData = result.sandboxes.map((sandbox) => {
					const row: Record<string, string | number> = {
						ID: sandbox.id,
						Name: sandbox.name || '-',
						Status: sandbox.status,
						Region: sandbox.region || '-',
						'Created At': sandbox.createdAt || '-',
					};
					if (showOrgColumn) {
						row.Organization = sandbox.orgName || sandbox.orgId;
					}
					return row;
				});

				const columns = [
					{ name: 'ID', alignment: 'left' as const },
					{ name: 'Name', alignment: 'left' as const },
					{ name: 'Status', alignment: 'left' as const },
					{ name: 'Region', alignment: 'left' as const },
					{ name: 'Created At', alignment: 'left' as const },
				];
				if (showOrgColumn) {
					columns.push({ name: 'Organization', alignment: 'left' as const });
				}

				tui.table(tableData, columns);
				tui.info(`Total: ${result.total} ${tui.plural(result.total, 'sandbox', 'sandboxes')}`);
			}
		}

		return {
			sandboxes: result.sandboxes.map((s) => ({
				id: s.id,
				name: s.name,
				description: s.description,
				status: s.status,
				createdAt: s.createdAt,
				region: s.region,
				orgId: s.orgId,
				orgName: s.orgName,
				projectId: s.projectId,
			})),
			total: result.total,
		};
	},
});

export default listSubcommand;
