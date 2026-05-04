import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWorkflowAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import {
	WorkflowListResultSchema,
	WorkflowSourceTypeSchema,
	WorkflowStatusSchema,
} from '@agentuity/core';

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List workflows',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud workflow list'), description: 'List workflows' },
		{ command: getCommand('cloud workflow list --limit 20'), description: 'List 20 workflows' },
		{
			command: getCommand('cloud workflow list --source-type queue'),
			description: 'List workflows with queue sources',
		},
	],
	schema: {
		options: z.object({
			limit: z.coerce.number().min(0).optional().describe('Maximum number of workflows'),
			offset: z.coerce.number().min(0).optional().describe('Pagination offset'),
			'source-type': WorkflowSourceTypeSchema.optional().describe('Filter by source type'),
			status: WorkflowStatusSchema.optional().describe('Filter by status'),
			filter: z.string().optional().describe('Filter workflows by name'),
		}),
		response: WorkflowListResultSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const workflow = await createWorkflowAdapter(ctx);
		const result = await workflow.list({
			limit: opts.limit,
			offset: opts.offset,
			source_type: opts['source-type'],
			status: opts.status,
			filter: opts.filter,
		});

		if (!options.json) {
			if (result.workflows.length === 0) {
				tui.info('No workflows found');
			} else {
				tui.table(
					result.workflows.map(
						(item: {
							id: string;
							created_at: string;
							updated_at: string;
							name: string;
							description: string | null;
							source_type: string;
							source_ref_id: string;
							status: string;
							execution_count?: number;
						}) => ({
							Name: item.name,
							ID: item.id,
							Source: item.source_type,
							'Ref ID': item.source_ref_id,
							Status: item.status,
							Execs: item.execution_count ?? 0,
							Created: new Date(item.created_at).toLocaleString(),
						})
					),
					['Name', 'ID', 'Source', 'Ref ID', 'Status', 'Execs', 'Created']
				);
			}
		}

		return result;
	},
});

export default listSubcommand;
