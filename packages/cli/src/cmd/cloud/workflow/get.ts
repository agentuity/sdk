import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createWorkflowAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const WorkflowGetResponseSchema = z.object({
	workflow: z.object({
		id: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		created_by: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		source_type: z.string(),
		source_ref_id: z.string(),
		source_config: z.record(z.string(), z.unknown()).nullable(),
		status: z.string(),
		graph_json: z.record(z.string(), z.unknown()).nullable(),
	}),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get workflow details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud workflow get wf_abc123'),
			description: 'Get workflow details',
		},
	],
	schema: {
		args: z.object({
			workflow_id: z.string().min(1).describe('Workflow ID'),
		}),
		response: WorkflowGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const workflow = await createWorkflowAdapter(ctx);
		const result = await workflow.get(args.workflow_id);

		if (!options.json) {
			const details: Record<string, unknown> = {
				Name: result.workflow.name,
				ID: result.workflow.id,
				'Source Type': result.workflow.source_type,
				'Source Ref ID': result.workflow.source_ref_id,
				Status: result.workflow.status,
				Description: result.workflow.description || '-',
				Created: new Date(result.workflow.created_at).toLocaleString(),
				Updated: new Date(result.workflow.updated_at).toLocaleString(),
			};

			tui.table([details], undefined, { layout: 'vertical', padStart: '  ' });

			if (result.workflow.graph_json) {
				tui.newline();
				tui.header('Graph');
				tui.info(JSON.stringify(result.workflow.graph_json, null, 2));
			}
		}

		return result;
	},
});

export default getSubcommand;
