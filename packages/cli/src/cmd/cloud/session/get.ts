import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { sessionGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getCatalystAPIClient } from '../../../config';

const SessionGetResponseSchema = z.object({
	id: z.string().describe('Session ID'),
	created_at: z.string().describe('Creation timestamp'),
	start_time: z.string().describe('Start time'),
	end_time: z.string().nullable().describe('End time'),
	duration: z.number().nullable().describe('Duration in nanoseconds'),
	org_id: z.string().describe('Organization ID'),
	project_id: z.string().describe('Project ID'),
	deployment_id: z.string().describe('Deployment ID'),
	agent_ids: z.array(z.string()).describe('Agent IDs'),
	trigger: z.string().describe('Trigger type'),
	env: z.string().describe('Environment'),
	devmode: z.boolean().describe('Dev mode'),
	pending: z.boolean().describe('Pending'),
	success: z.boolean().describe('Success'),
	error: z.string().nullable().describe('Error message'),
	method: z.string().describe('HTTP method'),
	url: z.string().describe('Request URL'),
	route_id: z.string().describe('Route ID'),
	thread_id: z.string().describe('Thread ID'),
	agentNames: z.array(z.string()).describe('Agent names'),
	evalRuns: z.array(z.object({
		id: z.string(),
		created_at: z.string(),
		eval_id: z.string(),
		pending: z.boolean(),
		success: z.boolean(),
		error: z.string().nullable(),
		result: z.string().nullable(),
	})).describe('Eval runs'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get details about a specific session',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [`${getCommand('cloud session get')} sess_abc123xyz`],
	requires: { auth: true },
	idempotent: true,
	schema: {
		args: z.object({
			session_id: z.string().describe('Session ID'),
		}),
		response: SessionGetResponseSchema,
	},
	async handler(ctx) {
		const { config, logger, auth, args, options } = ctx;
		const catalystClient = getCatalystAPIClient(config, logger, auth);

		try {
			const enriched = await sessionGet(catalystClient, { id: args.session_id });
			const session = enriched.session;

			const result = {
				id: session.id,
				created_at: session.created_at,
				start_time: session.start_time,
				end_time: session.end_time,
				duration: session.duration,
				org_id: session.org_id,
				project_id: session.project_id,
				deployment_id: session.deployment_id,
				agent_ids: session.agent_ids,
				trigger: session.trigger,
				env: session.env,
				devmode: session.devmode,
				pending: session.pending,
				success: session.success,
				error: session.error,
				method: session.method,
				url: session.url,
				route_id: session.route_id,
				thread_id: session.thread_id,
				agentNames: enriched.agentNames,
				evalRuns: enriched.evalRuns.map(run => ({
					id: run.id,
					eval_id: run.eval_id,
					created_at: run.created_at,
					pending: run.pending,
					success: run.success,
					error: run.error,
					result: run.result,
				})),
			};

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			tui.banner(`Session ${session.id}`, `Status: ${session.success ? 'Success' : 'Failed'}`);

			console.log(tui.bold('ID:          ') + session.id);
			console.log(tui.bold('Project:     ') + session.project_id);
			console.log(tui.bold('Deployment:  ') + (session.deployment_id || '-'));
			console.log(tui.bold('Created:     ') + new Date(session.created_at).toLocaleString());
			console.log(tui.bold('Start:       ') + new Date(session.start_time).toLocaleString());
			if (session.end_time) {
				console.log(tui.bold('End:         ') + new Date(session.end_time).toLocaleString());
			}
			if (session.duration) {
				console.log(
					tui.bold('Duration:    ') + `${(session.duration / 1_000_000).toFixed(0)}ms`
				);
			}
			console.log(tui.bold('Method:      ') + session.method);
			console.log(tui.bold('URL:         ') + tui.link(session.url, session.url));
			console.log(tui.bold('Trigger:     ') + session.trigger);
			console.log(tui.bold('Environment: ') + session.env);
			console.log(tui.bold('Dev Mode:    ') + (session.devmode ? 'Yes' : 'No'));
			console.log(tui.bold('Success:     ') + (session.success ? '✓' : '✗'));
			console.log(tui.bold('Pending:     ') + (session.pending ? 'Yes' : 'No'));
			if (session.error) {
				console.log(tui.bold('Error:       ') + tui.error(session.error));
			}
			if (enriched.agentNames.length > 0) {
				const agentDisplay = enriched.agentNames.map((name, idx) => {
					const agentId = session.agent_ids[idx];
					return `${name} ${tui.muted(`(${agentId})`)}`;
				}).join(', ');
				console.log(tui.bold('Agents:      ') + agentDisplay);
			}
			console.log(tui.bold('Route ID:    ') + session.route_id);
			console.log(tui.bold('Thread ID:   ') + session.thread_id);

			if (enriched.evalRuns.length > 0) {
				console.log('');
				console.log(tui.bold('Eval Runs:'));
				const evalTableData = enriched.evalRuns.map((run) => ({
					ID: run.id,
					'Eval ID': run.eval_id,
					Success: run.success ? '✓' : '✗',
					Pending: run.pending ? '⏳' : '✓',
					Error: run.error || 'No',
					Created: new Date(run.created_at).toLocaleString(),
				}));

				tui.table(evalTableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Eval ID', alignment: 'left' },
					{ name: 'Success', alignment: 'center' },
					{ name: 'Pending', alignment: 'center' },
					{ name: 'Error', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]);
			}

			return result;
		} catch (ex) {
			tui.fatal(
				`Failed to get session: ${ex instanceof Error ? ex.message : String(ex)}`,
				ErrorCode.API_ERROR
			);
		}
	},
});
