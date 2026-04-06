import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { APIError, evalRunGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const EvalRunGetResponseSchema = z.object({
	id: z.string().describe('Eval run ID'),
	eval_id: z.string().describe('Eval ID'),
	eval_name: z.string().nullable().describe('Eval name'),
	agent_identifier: z.string().nullable().describe('Agent identifier'),
	session_id: z.string().describe('Session ID'),
	created_at: z.string().describe('Creation timestamp'),
	updated_at: z.string().describe('Last updated timestamp'),
	project_id: z.string().describe('Project ID'),
	org_id: z.string().describe('Organization ID'),
	deployment_id: z.string().nullable().describe('Deployment ID'),
	devmode: z.boolean().describe('Whether this is a devmode run'),
	pending: z.boolean().describe('Whether the eval run is pending'),
	success: z.boolean().describe('Whether the eval run succeeded'),
	error: z.string().nullable().describe('Error message if failed'),
	result: z.any().nullable().describe('Eval run result'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get details about a specific eval run',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud eval-run get evalrun_abc123xyz'),
			description: 'Get an eval run by ID',
		},
	],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		args: z.object({
			eval_run_id: z.string().describe('Eval run ID'),
		}),
		response: EvalRunGetResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, args, options } = ctx;

		try {
			const evalRunData = await evalRunGet(apiClient, args.eval_run_id);

			const result = {
				id: evalRunData.id,
				eval_id: evalRunData.evalId,
				eval_name: evalRunData.evalName,
				agent_identifier: evalRunData.agentIdentifier,
				session_id: evalRunData.sessionId,
				created_at: evalRunData.createdAt,
				updated_at: evalRunData.updatedAt,
				project_id: evalRunData.projectId,
				org_id: evalRunData.orgId,
				deployment_id: evalRunData.deploymentId,
				devmode: evalRunData.devmode,
				pending: evalRunData.pending,
				success: evalRunData.success,
				error: evalRunData.error,
				result: evalRunData.result,
			};

			if (options.json) {
				return result;
			}

			const tableData: Record<string, string> = {
				ID: evalRunData.id,
				'Eval ID': evalRunData.evalId,
			};
			if (evalRunData.evalName) {
				tableData['Eval Name'] = evalRunData.evalName;
			}
			if (evalRunData.agentIdentifier) {
				tableData.Agent = evalRunData.agentIdentifier;
			}
			tableData['Session ID'] = evalRunData.sessionId;
			tableData.Project = evalRunData.projectId;
			tableData.Organization = evalRunData.orgId;
			tableData.Devmode = evalRunData.devmode ? '✓ Yes' : '✗ No';
			tableData.Success = evalRunData.success ? tui.colorSuccess('✓') : tui.colorError('✗');
			tableData.Pending = evalRunData.pending ? '⏳ Yes' : '✓ No';
			if (evalRunData.result?.reason) {
				tableData.Reason = evalRunData.result.reason;
			}
			if (evalRunData.error) {
				tableData.Error = tui.colorError(evalRunData.error);
			}
			tableData.Created = new Date(evalRunData.createdAt).toLocaleString();
			tableData.Updated = new Date(evalRunData.updatedAt).toLocaleString();

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
