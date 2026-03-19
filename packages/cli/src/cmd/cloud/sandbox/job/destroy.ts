import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { jobStop, sandboxResolve } from '@agentuity/server';

export const destroySubcommand = createCommand({
	name: 'destroy',
	aliases: ['stop', 'terminate'],
	description: 'Terminate a running job',
	tags: ['requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox job destroy sbx_abc123 job_xyz789'),
			description: 'Terminate a job gracefully',
		},
		{
			command: getCommand('cloud sandbox job destroy sbx_abc123 job_xyz789 --force'),
			description: 'Force kill a job',
		},
	],

	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			jobId: z.string().describe('Job ID'),
		}),
		options: z.object({
			force: z
				.boolean()
				.default(false)
				.describe('Force kill the job (SIGKILL instead of SIGTERM)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);

		const job = await jobStop(client, {
			sandboxId: args.sandboxId,
			jobId: args.jobId,
			force: opts.force,
			orgId,
		});

		if (options.json) {
			return job;
		}

		if (job.status === 'cancelled') {
			tui.success(`Job ${tui.bold(job.jobId)} terminated`);
		} else {
			tui.info(`Job ${tui.bold(job.jobId)} status: ${job.status}`);
		}

		return job;
	},
});

export default destroySubcommand;
