import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { APIError, evalGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const EvalGetResponseSchema = z.object({
	id: z.string().describe('Eval ID'),
	name: z.string().describe('Eval name'),
	identifier: z.string().nullable().describe('Stable eval identifier'),
	agent_identifier: z.string().describe('Agent identifier'),
	created_at: z.string().describe('Creation timestamp'),
	updated_at: z.string().describe('Last updated timestamp'),
	project_id: z.string().describe('Project ID'),
	org_id: z.string().describe('Organization ID'),
	description: z.string().nullable().describe('Eval description'),
	devmode: z.boolean().describe('Whether this is a devmode eval'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get details about a specific eval',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud eval get eval_abc123xyz'),
			description: 'Get an eval by ID',
		},
	],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		args: z.object({
			eval_id: z.string().describe('Eval ID'),
		}),
		response: EvalGetResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, args, options } = ctx;

		try {
			const evalData = await evalGet(apiClient, args.eval_id);

			const result = {
				id: evalData.id,
				name: evalData.name,
				identifier: evalData.identifier,
				agent_identifier: evalData.agentIdentifier,
				created_at: evalData.createdAt,
				updated_at: evalData.updatedAt,
				project_id: evalData.projectId,
				org_id: evalData.orgId,
				description: evalData.description,
				devmode: evalData.devmode,
			};

			if (options.json) {
				return result;
			}

			const tableData: Record<string, string> = {
				ID: evalData.id,
				Name: evalData.name,
				Identifier: evalData.identifier || '-',
				Agent: evalData.agentIdentifier,
				Project: evalData.projectId,
				Organization: evalData.orgId,
				Description: evalData.description || '-',
				Devmode: evalData.devmode ? tui.colorSuccess('✓') : tui.colorError('✗'),
				Created: new Date(evalData.createdAt).toLocaleString(),
				Updated: new Date(evalData.updatedAt).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			return result;
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Eval ${args.eval_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			tui.fatal(`Failed to get eval: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
