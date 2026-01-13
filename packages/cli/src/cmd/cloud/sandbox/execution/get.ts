import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { getCommand } from '../../../../command-prefix';
import { executionGet } from '@agentuity/server';
import { getGlobalCatalystAPIClient } from '../../../../config';

const ExecutionGetResponseSchema = z.object({
	executionId: z.string().describe('Execution ID'),
	sandboxId: z.string().describe('Sandbox ID'),
	status: z.string().describe('Current status'),
	command: z.array(z.string()).optional().describe('Command that was executed'),
	exitCode: z.number().optional().describe('Exit code'),
	durationMs: z.number().optional().describe('Duration in milliseconds'),
	startedAt: z.string().optional().describe('Start timestamp'),
	completedAt: z.string().optional().describe('Completion timestamp'),
	error: z.string().optional().describe('Error message if failed'),
	stdoutStreamUrl: z.string().optional().describe('URL to stream stdout'),
	stderrStreamUrl: z.string().optional().describe('URL to stream stderr'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get information about a specific execution',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox execution get exec_abc123'),
			description: 'Get execution information',
		},
	],
	schema: {
		args: z.object({
			executionId: z.string().describe('Execution ID'),
		}),
		response: ExecutionGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, orgId, config } = ctx;
		const client = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const result = await executionGet(client, { executionId: args.executionId, orgId });

		if (!options.json) {
			const statusColor =
				result.status === 'completed'
					? tui.colorSuccess
					: result.status === 'running'
						? tui.colorWarning
						: result.status === 'failed' || result.status === 'timeout'
							? tui.colorError
							: tui.colorMuted;

			const tableData: Record<string, string | number> = {
				Execution: tui.bold(result.executionId),
				Sandbox: result.sandboxId,
				Status: statusColor(result.status),
			};

			if (result.exitCode !== undefined) {
				const exitCodeColor = result.exitCode === 0 ? tui.colorSuccess : tui.colorError;
				tableData['Exit Code'] = exitCodeColor(String(result.exitCode));
			}
			if (result.durationMs !== undefined) {
				tableData['Duration'] = `${result.durationMs}ms`;
			}
			if (result.startedAt) {
				tableData['Started'] = result.startedAt;
			}
			if (result.completedAt) {
				tableData['Completed'] = result.completedAt;
			}
			if (result.error) {
				tableData['Error'] = tui.colorError(result.error);
			}
			if (result.stdoutStreamUrl) {
				tableData['Stdout'] = result.stdoutStreamUrl;
			}
			if (result.stderrStreamUrl) {
				tableData['Stderr'] = result.stderrStreamUrl;
			}
			if (result.command && result.command.length > 0) {
				tableData['Command'] = result.command.join(' ');
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			executionId: result.executionId,
			sandboxId: result.sandboxId,
			status: result.status,
			command: result.command,
			exitCode: result.exitCode,
			durationMs: result.durationMs,
			startedAt: result.startedAt,
			completedAt: result.completedAt,
			error: result.error,
			stdoutStreamUrl: result.stdoutStreamUrl,
			stderrStreamUrl: result.stderrStreamUrl,
		};
	},
});

export default getSubcommand;
