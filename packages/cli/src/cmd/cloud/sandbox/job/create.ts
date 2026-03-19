import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { jobCreate, sandboxResolve } from '@agentuity/server';

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a background job in a sandbox',
	tags: ['requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox job create snbx_abc123 -- bun run build'),
			description: 'Create a background job',
		},
		{
			command: getCommand('cloud sandbox job create snbx_abc123 -- npm install'),
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

		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

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
