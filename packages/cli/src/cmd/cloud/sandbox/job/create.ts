import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createSandboxClient, resolveSandboxTarget } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';
import { jobCreate } from '@agentuity/server';

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a background job in a sandbox',
	tags: ['requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox job create sbx_abc123 -- bun run build'),
			description: 'Create a background job',
		},
		{
			command: getCommand('cloud sandbox job create sbx_abc123 -- npm install'),
			description: 'Run npm install as a background job',
		},
	],

	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			command: z.array(z.string()).describe('Command and arguments to run as a background job'),
		}),
		options: z.object({}),
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const { region, orgId } = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			args.sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, region);

		const job = await jobCreate(client, {
			sandboxId: args.sandboxId,
			options: {
				command: args.command,
			},
			orgId,
		});

		if (options.json) {
			return job;
		}

		tui.success(`Created job ${tui.bold(job.jobId)}`);
		tui.info(`Status: ${job.status}`);
		tui.muted(
			`Use 'agentuity cloud sandbox job get ${args.sandboxId} ${job.jobId}' to check status`
		);

		return job;
	},
});

export default createSubcommand;
