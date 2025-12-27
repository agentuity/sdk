import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxGet } from '@agentuity/server';

const SandboxGetResponseSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	status: z.string().describe('Current status'),
	createdAt: z.string().describe('Creation timestamp'),
	executions: z.number().describe('Number of executions'),
	stdoutStreamUrl: z.string().optional().describe('URL to stdout output stream'),
	stderrStreamUrl: z.string().optional().describe('URL to stderr output stream'),
	dependencies: z.array(z.string()).optional().describe('Apt packages installed'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get information about a sandbox',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox get abc123'),
			description: 'Get sandbox information',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		response: SandboxGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const result = await sandboxGet(client, { sandboxId: args.sandboxId, orgId });

		if (!options.json) {
			const statusColor =
				result.status === 'running'
					? tui.colorSuccess
					: result.status === 'idle'
						? tui.colorWarning
						: result.status === 'failed'
							? tui.colorError
							: tui.colorMuted;

			console.log(`${tui.muted('Sandbox:')}         ${tui.bold(result.sandboxId)}`);
			console.log(`${tui.muted('Status:')}          ${statusColor(result.status)}`);
			console.log(`${tui.muted('Created:')}         ${result.createdAt}`);
			console.log(`${tui.muted('Executions:')}      ${result.executions}`);
			if (
				result.stdoutStreamUrl &&
				result.stderrStreamUrl &&
				result.stdoutStreamUrl === result.stderrStreamUrl
			) {
				console.log(`${tui.muted('Stream:')}          ${tui.link(result.stdoutStreamUrl)}`);
			} else {
				if (result.stdoutStreamUrl) {
					console.log(`${tui.muted('Stream (stdout):')} ${tui.link(result.stdoutStreamUrl)}`);
				}
				if (result.stderrStreamUrl) {
					console.log(`${tui.muted('Stream (stderr):')} ${tui.link(result.stderrStreamUrl)}`);
				}
			}
			if (result.dependencies && result.dependencies.length > 0) {
				console.log(`${tui.muted('Dependencies:')}    ${result.dependencies.join(', ')}`);
			}
		}

		return {
			sandboxId: result.sandboxId,
			status: result.status,
			createdAt: result.createdAt,
			executions: result.executions,
			stdoutStreamUrl: result.stdoutStreamUrl,
			stderrStreamUrl: result.stderrStreamUrl,
			dependencies: result.dependencies,
		};
	},
});

export default getSubcommand;
