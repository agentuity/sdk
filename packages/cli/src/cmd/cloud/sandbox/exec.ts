import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxExecute } from '@agentuity/server';

const SandboxExecResponseSchema = z.object({
	executionId: z.string().describe('Unique execution identifier'),
	status: z.string().describe('Execution status'),
	exitCode: z.number().optional().describe('Exit code (if completed)'),
	durationMs: z.number().optional().describe('Duration in milliseconds (if completed)'),
});

export const execSubcommand = createCommand({
	name: 'exec',
	aliases: ['execute'],
	description: 'Execute a command in a running sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox exec abc123 -- echo "hello"'),
			description: 'Execute a command in a sandbox',
		},
		{
			command: getCommand('cloud sandbox exec abc123 --timeout 5m -- bun run build'),
			description: 'Execute with timeout',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			command: z.array(z.string()).describe('Command and arguments to execute'),
		}),
		options: z.object({
			timeout: z.string().optional().describe('Execution timeout (e.g., "5m", "1h")'),
		}),
		response: SandboxExecResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		const result = await sandboxExecute(client, {
			sandboxId: args.sandboxId,
			options: {
				command: args.command,
				timeout: opts.timeout,
			},
			orgId,
		});

		if (!options.json) {
			const duration = Date.now() - started;
			tui.info(`Execution ${tui.bold(result.executionId)} - Status: ${result.status}`);
			if (result.exitCode !== undefined) {
				if (result.exitCode === 0) {
					tui.success(`completed with exit code ${result.exitCode} in ${duration}ms`);
				} else {
					tui.error(`failed with exit code ${result.exitCode} in ${duration}ms`);
				}
			}
		}

		return {
			executionId: result.executionId,
			status: result.status,
			exitCode: result.exitCode,
			durationMs: result.durationMs,
		};
	},
});

export default execSubcommand;
