import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { APIError } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const EvalGetResponseSchema = z.object({
	id: z.string().describe('Eval ID'),
	name: z.string().describe('Eval name'),
	created_at: z.string().describe('Creation timestamp'),
	updated_at: z.string().describe('Last updated timestamp'),
	project_id: z.string().describe('Project ID'),
	org_id: z.string().describe('Organization ID'),
	description: z.string().nullable().describe('Eval description'),
	enabled: z.boolean().describe('Whether the eval is enabled'),
	config: z.record(z.string(), z.unknown()).nullable().describe('Eval configuration'),
});

type EvalData = {
	id: string;
	name: string;
	created_at: string;
	updated_at: string;
	project_id: string;
	org_id: string;
	description: string | null;
	enabled: boolean;
	config: Record<string, unknown> | null;
};

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
	requires: { auth: true },
	idempotent: true,
	schema: {
		args: z.object({
			eval_id: z.string().optional().describe('Eval ID'),
		}),
		response: EvalGetResponseSchema,
	},
	async handler(ctx) {
		const { logger, auth, args, options, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		try {
			// TODO: Replace with actual API call once endpoint is provided
			// const evalData = await evalGet(catalystClient, { id: args.eval_id });
			const evalData: EvalData = null as unknown as EvalData;

			const result = {
				id: evalData.id,
				name: evalData.name,
				created_at: evalData.created_at,
				updated_at: evalData.updated_at,
				project_id: evalData.project_id,
				org_id: evalData.org_id,
				description: evalData.description,
				enabled: evalData.enabled,
				config: evalData.config,
			};

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			const tableData: Record<string, string> = {
				ID: evalData.id,
				Name: evalData.name,
				Project: evalData.project_id,
				Organization: evalData.org_id,
				Description: evalData.description || '-',
				Enabled: evalData.enabled ? tui.colorSuccess('✓') : tui.colorError('✗'),
				Created: new Date(evalData.created_at).toLocaleString(),
				Updated: new Date(evalData.updated_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			if (evalData.config && Object.keys(evalData.config).length > 0) {
				console.log('');
				console.log(tui.bold('Configuration:'));
				console.log(JSON.stringify(evalData.config, null, 2));
			}

			return result;
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Eval ${args.eval_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			tui.fatal(`Failed to get eval: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
