import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { APIError } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';

const EvalRunGetResponseSchema = z.object({
	id: z.string().describe('Eval run ID'),
	eval_id: z.string().describe('Eval ID'),
	session_id: z.string().describe('Session ID'),
	created_at: z.string().describe('Creation timestamp'),
	project_id: z.string().describe('Project ID'),
	org_id: z.string().describe('Organization ID'),
	pending: z.boolean().describe('Whether the eval run is pending'),
	success: z.boolean().describe('Whether the eval run succeeded'),
	error: z.string().nullable().describe('Error message if failed'),
	result: z.record(z.string(), z.unknown()).nullable().describe('Eval run result'),
	eval_name: z.string().optional().describe('Eval name'),
});

type EvalRunData = {
	id: string;
	eval_id: string;
	session_id: string;
	created_at: string;
	project_id: string;
	org_id: string;
	pending: boolean;
	success: boolean;
	error: string | null;
	result: Record<string, unknown> | null;
	eval_name?: string;
};

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get details about a specific eval run',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud eval-run get evalrun_abc123xyz'),
			description: 'Get an eval run by ID',
		},
	],
	requires: { auth: true },
	idempotent: true,
	schema: {
		args: z.object({
			eval_run_id: z.string().optional().describe('Eval run ID'),
		}),
		response: EvalRunGetResponseSchema,
	},
	async handler(ctx) {
		const { logger, auth, args, options, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		try {
			// TODO: Replace with actual API call once endpoint is provided
			// const evalRunData = await evalRunGet(catalystClient, { id: args.eval_run_id });
			const evalRunData: EvalRunData = null as unknown as EvalRunData;

			const result = {
				id: evalRunData.id,
				eval_id: evalRunData.eval_id,
				session_id: evalRunData.session_id,
				created_at: evalRunData.created_at,
				project_id: evalRunData.project_id,
				org_id: evalRunData.org_id,
				pending: evalRunData.pending,
				success: evalRunData.success,
				error: evalRunData.error,
				result: evalRunData.result,
				eval_name: evalRunData.eval_name,
			};

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			const tableData: Record<string, string> = {
				ID: evalRunData.id,
				'Eval ID': evalRunData.eval_id,
			};
			if (evalRunData.eval_name) {
				tableData['Eval Name'] = evalRunData.eval_name;
			}
			tableData['Session ID'] = evalRunData.session_id;
			tableData['Project'] = evalRunData.project_id;
			tableData['Organization'] = evalRunData.org_id;
			tableData['Success'] = evalRunData.success ? tui.colorSuccess('✓') : tui.colorError('✗');
			tableData['Pending'] = evalRunData.pending ? '⏳ Yes' : '✓ No';
			if (evalRunData.error) {
				tableData['Error'] = tui.colorError(evalRunData.error);
			}
			tableData['Created'] = new Date(evalRunData.created_at).toLocaleString();

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

			if (evalRunData.result && Object.keys(evalRunData.result).length > 0) {
				console.log('');
				console.log(tui.bold('Result:'));
				console.log(JSON.stringify(evalRunData.result, null, 2));
			}

			return result;
		} catch (ex) {
			if (ex instanceof APIError && ex.status === 404) {
				tui.fatal(`Eval run ${args.eval_run_id} not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			tui.fatal(`Failed to get eval run: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
