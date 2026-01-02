import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { executionList } from '@agentuity/server';

const ExecutionInfoSchema = z.object({
	executionId: z.string().describe('Execution ID'),
	sandboxId: z.string().describe('Sandbox ID'),
	status: z.string().describe('Current status'),
	exitCode: z.number().optional().describe('Exit code'),
	durationMs: z.number().optional().describe('Duration in milliseconds'),
	startedAt: z.string().optional().describe('Start timestamp'),
	completedAt: z.string().optional().describe('Completion timestamp'),
	error: z.string().optional().describe('Error message if failed'),
});

const ExecutionListResponseSchema = z.object({
	executions: z.array(ExecutionInfoSchema).describe('List of executions'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List executions for a sandbox',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox execution list snbx_abc123'),
			description: 'List executions for a sandbox',
		},
		{
			command: getCommand('cloud sandbox execution list snbx_abc123 --limit 10'),
			description: 'List with a limit',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({
			limit: z.number().optional().describe('Maximum number of results (default: 50, max: 100)'),
		}),
		response: ExecutionListResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const result = await executionList(client, {
			sandboxId: args.sandboxId,
			orgId,
			limit: opts.limit,
		});

		if (!options.json) {
			if (result.executions.length === 0) {
				tui.info('No executions found');
			} else {
				const tableData = result.executions.map((exec) => {
					const statusColor =
						exec.status === 'completed'
							? tui.colorSuccess
							: exec.status === 'running'
								? tui.colorWarning
								: exec.status === 'failed' || exec.status === 'timeout'
									? tui.colorError
									: tui.colorMuted;

					return {
						ID: exec.executionId,
						Status: statusColor(exec.status),
						'Exit Code': exec.exitCode !== undefined ? String(exec.exitCode) : '-',
						Duration: exec.durationMs !== undefined ? `${exec.durationMs}ms` : '-',
						Started: exec.startedAt || '-',
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
					{ name: 'Exit Code', alignment: 'right' },
					{ name: 'Duration', alignment: 'right' },
					{ name: 'Started', alignment: 'left' },
				]);

				tui.info(
					`Total: ${result.executions.length} ${tui.plural(result.executions.length, 'execution', 'executions')}`
				);
			}
		}

		return {
			executions: result.executions.map((e) => ({
				executionId: e.executionId,
				sandboxId: e.sandboxId,
				status: e.status,
				exitCode: e.exitCode,
				durationMs: e.durationMs,
				startedAt: e.startedAt,
				completedAt: e.completedAt,
				error: e.error,
			})),
		};
	},
});

export default listSubcommand;
