import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createSandboxClient, resolveSandboxTarget } from '../util.ts';
import { jobList } from '@agentuity/server';

export const listSubcommand = createCommand({
	name: 'list',
	description: 'List jobs for a sandbox',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, apiClient: true },

	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(20)
				.describe('Maximum number of jobs to list'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		const { region, orgId } = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			args.sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, region);

		const result = await jobList(client, {
			sandboxId: args.sandboxId,
			orgId,
			limit: opts.limit,
		});

		if (options.json) {
			return result;
		}

		if (result.jobs.length === 0) {
			tui.info('No jobs found');
			return result;
		}

		tui.info(`Jobs for sandbox ${tui.bold(args.sandboxId)}:`);
		console.log('');

		for (const job of result.jobs) {
			const statusText =
				job.status === 'completed'
					? tui.colorSuccess(job.status)
					: job.status === 'failed'
						? tui.colorError(job.status)
						: job.status === 'running'
							? tui.colorWarning(job.status)
							: tui.colorMuted(job.status);
			console.log(
				`  ${tui.bold(job.jobId)} ${statusText} ${tui.colorMuted(job.command.join(' '))}`
			);
			if (job.exitCode !== undefined && job.exitCode !== null) {
				console.log(`    Exit code: ${job.exitCode}`);
			}
			if (job.startedAt) {
				console.log(`    Started: ${job.startedAt}`);
			}
			if (job.completedAt) {
				console.log(`    Completed: ${job.completedAt}`);
			}
		}

		return result;
	},
});

export default listSubcommand;
