import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { executionGet } from '@agentuity/server';

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
	requires: { auth: true, region: true, org: true },
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
		const { args, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

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

			console.log(`${tui.muted('Execution:')}       ${tui.bold(result.executionId)}`);
			console.log(`${tui.muted('Sandbox:')}         ${result.sandboxId}`);
			console.log(`${tui.muted('Status:')}          ${statusColor(result.status)}`);
			if (result.exitCode !== undefined) {
				const exitCodeColor = result.exitCode === 0 ? tui.colorSuccess : tui.colorError;
				console.log(
					`${tui.muted('Exit Code:')}       ${exitCodeColor(String(result.exitCode))}`
				);
			}
			if (result.durationMs !== undefined) {
				console.log(`${tui.muted('Duration:')}        ${result.durationMs}ms`);
			}
			if (result.startedAt) {
				console.log(`${tui.muted('Started:')}         ${result.startedAt}`);
			}
			if (result.completedAt) {
				console.log(`${tui.muted('Completed:')}       ${result.completedAt}`);
			}
			if (result.error) {
				console.log(`${tui.muted('Error:')}           ${tui.colorError(result.error)}`);
			}
			if (result.stdoutStreamUrl) {
				console.log(`${tui.muted('Stdout:')}          ${result.stdoutStreamUrl}`);
			}
			if (result.stderrStreamUrl) {
				console.log(`${tui.muted('Stderr:')}          ${result.stderrStreamUrl}`);
			}
			if (result.command && result.command.length > 0) {
				console.log(`${tui.muted('Command:')}         ${result.command.join(' ')}`);
			}
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
