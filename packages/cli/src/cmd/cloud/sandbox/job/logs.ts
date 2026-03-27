import { z } from 'zod';
import { createSubcommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { jobGet, sandboxResolve, writeAndDrain } from '@agentuity/server';
import { getCommand } from '../../../../command-prefix';
import type { Logger } from '@agentuity/core';

const JobLogsResponseSchema = z.object({
	jobId: z.string(),
	sandboxId: z.string(),
	status: z.string(),
	stdoutSize: z.number().optional(),
	stderrSize: z.number().optional(),
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

		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

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

		let stdoutSize = 0;
		let stderrSize = 0;

		try {
			await streamUrlToWritable(
				opts.stderr ? 'stderr' : 'stdout',
				streamUrl,
				process.stdout,
				abortController.signal,
				logger,
				{
					follow: opts.follow,
					timestamps: opts.timestamps ?? true,
					grep: opts.grep,
					tail: opts.tail,
					json: isJson,
				}
			);

			if (opts.stderr) {
				stderrSize = 0;
			} else {
				stdoutSize = 0;
			}
		} finally {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		}

		return {
			jobId: job.jobId,
			sandboxId: job.sandboxId,
			status: job.status,
			stdoutSize: stdoutSize > 0 ? stdoutSize : undefined,
			stderrSize: stderrSize > 0 ? stderrSize : undefined,
		};
	},
});

interface StreamOptions {
	follow: boolean;
	timestamps: boolean;
	grep?: string;
	tail?: number;
	json: boolean;
}

async function streamUrlToWritable(
	label: string,
	url: string,
	writable: NodeJS.WritableStream,
	signal: AbortSignal,
	logger: Logger,
	options: StreamOptions
): Promise<void> {
	const streamStart = Date.now();
	try {
		const fetchUrl = new URL(url);

		// Only use v=2 when following (real-time streaming)
		// For completed jobs, v=2 can block indefinitely waiting for metadata
		if (options.follow) {
			fetchUrl.searchParams.set('v', '2');
			fetchUrl.searchParams.set('follow', 'true');
		}

		logger.debug('[stream:%s] fetching: %s', label, fetchUrl.href);
		const response = await fetch(fetchUrl.href, { signal });
		logger.debug(
			'[stream:%s] response status=%d in %dms',
			label,
			response.status,
			Date.now() - streamStart
		);

		if (!response.ok || !response.body) {
			logger.debug('[stream:%s] not ok or no body — returning', label);
			if (!options.json) {
				tui.error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
			}
			return;
		}

		const reader = response.body.getReader();
		let chunks = 0;
		let totalBytes = 0;
		const lines: string[] = [];
		const grepPattern = options.grep ? new RegExp(options.grep, 'i') : null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				logger.debug(
					'[stream:%s] EOF after %dms (%d chunks, %d bytes)',
					label,
					Date.now() - streamStart,
					chunks,
					totalBytes
				);
				break;
			}

			if (value) {
				chunks++;
				totalBytes += value.length;
				const text = new TextDecoder().decode(value);

				const textLines = text.split('\n');

				if (options.tail !== undefined || grepPattern !== null) {
					for (const line of textLines) {
						if (line.trim()) {
							if (grepPattern !== null && !grepPattern.test(line)) {
								continue;
							}
							lines.push(line);
						}
					}
				} else {
					for (const line of textLines) {
						if (line.trim()) {
							const outputLine = options.timestamps ? formatLineWithTimestamp(line) : line;
							await writeAndDrain(writable, Buffer.from(outputLine + '\n'));
						}
					}
				}
			}
		}

		if (options.tail !== undefined && lines.length > 0) {
			const startIdx = Math.max(0, lines.length - options.tail);
			const tailLines = lines.slice(startIdx);
			for (const line of tailLines) {
				const outputLine = options.timestamps ? formatLineWithTimestamp(line) : line;
				await writeAndDrain(writable, Buffer.from(outputLine + '\n'));
			}
		} else if (options.tail === undefined && grepPattern !== null && lines.length > 0) {
			for (const line of lines) {
				const outputLine = options.timestamps ? formatLineWithTimestamp(line) : line;
				await writeAndDrain(writable, Buffer.from(outputLine + '\n'));
			}
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger.debug('[stream:%s] aborted after %dms', label, Date.now() - streamStart);
			return;
		}
		logger.debug('[stream:%s] error after %dms: %s', label, Date.now() - streamStart, err);
		throw err;
	}
}

function formatLineWithTimestamp(line: string): string {
	const timestamp = new Date().toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	return `${tui.muted(timestamp)} ${line}`;
}

export default logsSubcommand;
