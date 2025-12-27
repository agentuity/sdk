import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { sandboxList } from '@agentuity/server';
import { createSandboxClient } from './util';
import type { SandboxStatus } from '@agentuity/core';

const SandboxInfoSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	status: z.string().describe('Current status'),
	createdAt: z.string().describe('Creation timestamp'),
	executions: z.number().describe('Number of executions'),
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
	requires: { auth: true, region: true, org: true },
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
			command: getCommand('cloud sandbox list --limit 10 --offset 20'),
			description: 'List with pagination',
		},
	],
	schema: {
		options: z.object({
			status: z
				.enum(['creating', 'idle', 'running', 'terminated', 'failed'])
				.optional()
				.describe('Filter by status'),
			projectId: z.string().optional().describe('Filter by project ID'),
			limit: z.number().optional().describe('Maximum number of results (default: 50, max: 100)'),
			offset: z.number().optional().describe('Pagination offset'),
		}),
		response: SandboxListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, auth, project, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const projectId = opts.projectId || project?.projectId;

		const result = await sandboxList(client, {
			orgId,
			projectId,
			status: opts.status as SandboxStatus | undefined,
			limit: opts.limit,
			offset: opts.offset,
		});

		if (!options.json) {
			if (result.sandboxes.length === 0) {
				tui.info('No sandboxes found');
			} else {
				const tableData = result.sandboxes.map((sandbox) => {
					return {
						ID: sandbox.sandboxId,
						Status: sandbox.status,
						'Created At': sandbox.createdAt,
						Executions: sandbox.executions,
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
					{ name: 'Created At', alignment: 'left' },
					{ name: 'Executions', alignment: 'right' },
				]);

				tui.info(`Total: ${result.total} ${tui.plural(result.total, 'sandbox', 'sandboxes')}`);
			}
		}

		return {
			sandboxes: result.sandboxes.map((s) => ({
				sandboxId: s.sandboxId,
				status: s.status,
				createdAt: s.createdAt,
				executions: s.executions,
			})),
			total: result.total,
		};
	},
});

export default listSubcommand;
