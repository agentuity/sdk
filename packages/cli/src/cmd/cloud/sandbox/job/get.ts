import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { jobGet, sandboxResolve } from '@agentuity/server';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get details of a specific job',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, apiClient: true },

	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			jobId: z.string().describe('Job ID'),
		}),
		options: z.object({}),
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);

		const job = await jobGet(client, {
			sandboxId: args.sandboxId,
			jobId: args.jobId,
			orgId,
		});

		if (options.json) {
			return job;
		}

		const statusText =
			job.status === 'completed'
				? tui.colorSuccess(job.status)
				: job.status === 'failed'
					? tui.colorError(job.status)
					: job.status === 'running'
						? tui.colorWarning(job.status)
						: tui.colorMuted(job.status);

		tui.info(`Job ${tui.bold(job.jobId)}`);
		console.log('');
		console.log(`  Status:     ${statusText}`);
		console.log(`  Sandbox:    ${job.sandboxId}`);
		console.log(`  Command:    ${job.command.join(' ')}`);

		if (job.exitCode !== undefined && job.exitCode !== null) {
			console.log(`  Exit code:  ${job.exitCode}`);
		}
		if (job.startedAt) {
			console.log(`  Started:    ${job.startedAt}`);
		}
		if (job.completedAt) {
			console.log(`  Completed:  ${job.completedAt}`);
		}
		if (job.error) {
			console.log(`  Error:      ${tui.colorError(job.error)}`);
		}
		if (job.stdoutStreamUrl) {
			console.log(`  Stdout:     ${job.stdoutStreamUrl}`);
		}
		if (job.stderrStreamUrl) {
			console.log(`  Stderr:     ${job.stderrStreamUrl}`);
		}

		return job;
	},
});

export default getSubcommand;
