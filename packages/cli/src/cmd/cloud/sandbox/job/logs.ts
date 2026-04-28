import { z } from 'zod';
import { createSubcommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient, resolveSandboxTarget } from '../util';
import { jobGet } from '@agentuity/server';
import { getCommand } from '../../../../command-prefix';
import { streamUrlToWritable } from '../../../../utils/stream-url';

const JobLogsResponseSchema = z.object({
	jobId: z.string(),
	sandboxId: z.string(),
	status: z.string(),
	bytesRead: z.number().optional(),
});

export const logsSubcommand = createSubcommand({
	name: 'logs',
	aliases: ['log'],
	description: 'Stream logs from a sandbox job',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789'),
			description: 'View stdout logs from a job',
		},
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789 --stderr'),
			description: 'View stderr logs from a job',
		},
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789 --follow'),
			description: 'Follow logs in real-time',
		},
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789 --grep error'),
			description: 'Filter logs containing "error"',
		},
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789 --tail 100'),
			description: 'Show last 100 lines',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			jobId: z.string().describe('Job ID'),
		}),
		options: z.object({
			stderr: z.boolean().default(false).describe('Show stderr instead of stdout'),
			follow: z.boolean().default(false).describe('Follow logs in real-time (for running jobs)'),
			timestamps: z.boolean().default(true).describe('Show timestamps in output'),
			grep: z.string().optional().describe('Filter logs by pattern (case-insensitive)'),
			tail: z.coerce
				.number()
				.int()
				.min(1)
				.optional()
				.describe('Number of lines to show from the end'),
		}),
		response: JobLogsResponseSchema,
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

		const job = await jobGet(client, {
			sandboxId: args.sandboxId,
			jobId: args.jobId,
			orgId,
		});

		const streamUrl = opts.stderr ? job.stderrStreamUrl : job.stdoutStreamUrl;
		const isJson = options.json ?? false;

		if (!streamUrl) {
			if (isJson) {
				return {
					jobId: job.jobId,
					sandboxId: job.sandboxId,
					status: job.status,
				};
			}
			tui.warning(
				`No ${opts.stderr ? 'stderr' : 'stdout'} stream available for job ${job.jobId}`
			);
			if (job.status === 'pending') {
				tui.info('Job is still pending - logs will be available once it starts running');
			}
			return {
				jobId: job.jobId,
				sandboxId: job.sandboxId,
				status: job.status,
			};
		}

		if (!isJson) {
			tui.info(
				`Streaming ${opts.stderr ? 'stderr' : 'stdout'} for job ${tui.bold(job.jobId)} (status: ${job.status})`
			);
		}

		const abortController = new AbortController();
		const handleSignal = () => {
			abortController.abort();
		};
		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		try {
			const result = await streamUrlToWritable(streamUrl, process.stdout, logger, {
				signal: abortController.signal,
				follow: opts.follow,
				timestamps: opts.timestamps ?? true,
				grep: opts.grep,
				tail: opts.tail,
				json: isJson,
				label: opts.stderr ? 'stderr' : 'stdout',
				v2: true,
			});

			return {
				jobId: job.jobId,
				sandboxId: job.sandboxId,
				status: job.status,
				bytesRead: result.bytesRead,
			};
		} finally {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		}
	},
});

export default logsSubcommand;
