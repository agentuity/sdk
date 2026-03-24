import { z } from 'zod';
import { Writable } from 'node:stream';
import { ErrorCode } from '../../../errors';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxExecute, executionGet, writeAndDrain, sandboxResolve } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

// Server-side long-poll wait duration (max 5 minutes supported by server)
const EXECUTION_WAIT_DURATION = '5m';

const SandboxExecResponseSchema = z.object({
	executionId: z.string().describe('Unique execution identifier'),
	status: z.string().describe('Execution status'),
	exitCode: z.number().optional().describe('Exit code (if completed)'),
	durationMs: z.number().optional().describe('Duration in milliseconds (if completed)'),
	stdout: z
		.string()
		.optional()
		.describe('Standard output (only when separate streams are available)'),
	stderr: z
		.string()
		.optional()
		.describe('Standard error output (only when separate streams are available)'),
	output: z.string().optional().describe('Combined stdout/stderr output'),
	outputTruncated: z
		.boolean()
		.optional()
		.describe('Whether the captured output was truncated due to size limits'),
	autoResumed: z
		.boolean()
		.optional()
		.describe('True if the sandbox was automatically resumed from a suspended state'),
});

export const execSubcommand = createCommand({
	name: 'exec',
	aliases: ['execute'],
	description: 'Execute a command in a running sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
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
			timestamps: z
				.boolean()
				.default(false)
				.optional()
				.describe('Include timestamps in output (default: false)'),
		}),
		response: SandboxExecResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		// Validate timeout format if provided (fail fast before any network calls)
		if (opts.timeout) {
			// Go's time.ParseDuration accepts "0" or one-or-more number+unit tokens.
			// Valid units: ns, us, µs (U+00B5), μs (U+03BC), ms, s, m, h
			if (!/^(?:0|(\d+(\.\d+)?(ns|us|[µμ]s|ms|s|m|h))+)$/.test(opts.timeout)) {
				tui.fatal(
					`Invalid timeout format '${opts.timeout}': expected duration like '5s', '1m', '1h', '300ms'`,
					ErrorCode.INVALID_ARGUMENT
				);
			}
		}

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		const abortController = new AbortController();
		const handleSignal = () => {
			abortController.abort();
		};
		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		try {
			logger.debug('[exec] calling sandboxExecute for %s', args.sandboxId);
			const executeStart = Date.now();
			const execution = await sandboxExecute(client, {
				sandboxId: args.sandboxId,
				options: {
					command: args.command,
					timeout: opts.timeout,
					stream: opts.timestamps !== undefined ? { timestamps: opts.timestamps } : undefined,
				},
				orgId,
			});
			logger.debug(
				'[exec] sandboxExecute returned in %dms: executionId=%s, stdoutUrl=%s, stderrUrl=%s',
				Date.now() - executeStart,
				execution.executionId,
				execution.stdoutStreamUrl ?? 'none',
				execution.stderrStreamUrl ?? 'none'
			);

			if (execution.autoResumed && !options.json) {
				tui.warning('Sandbox was automatically resumed from suspended state');
			}

			const stdoutStreamUrl = execution.stdoutStreamUrl;
			const stderrStreamUrl = execution.stderrStreamUrl;
			const streamAbortController = new AbortController();
			const streamPromises: Promise<void>[] = [];
			const streamLabels: string[] = [];

			// Check if stdout and stderr are the same stream (combined output)
			const isCombinedOutput =
				stdoutStreamUrl && stderrStreamUrl && stdoutStreamUrl === stderrStreamUrl;
			logger.debug(
				'[exec] stream mode: combined=%s, stdoutUrl=%s, stderrUrl=%s',
				isCombinedOutput,
				stdoutStreamUrl ?? 'none',
				stderrStreamUrl ?? 'none'
			);

			// Set up stream capture — in JSON mode, capture to buffers;
			// when streams are separate, capture stdout/stderr independently
			const outputChunks: string[] = [];
			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];

			let stdoutWritable: NodeJS.WritableStream;
			let stderrWritable: NodeJS.WritableStream;

			if (options.json) {
				if (isCombinedOutput) {
					// Combined stream: can't distinguish stdout from stderr
					stdoutWritable = createCaptureStream((chunk) => outputChunks.push(chunk));
					stderrWritable = createCaptureStream((chunk) => outputChunks.push(chunk));
				} else {
					// Separate streams: capture each independently and also to combined output
					stdoutWritable = createCaptureStream((chunk) => {
						stdoutChunks.push(chunk);
						outputChunks.push(chunk);
					});
					stderrWritable = createCaptureStream((chunk) => {
						stderrChunks.push(chunk);
						outputChunks.push(chunk);
					});
				}
			} else {
				stdoutWritable = process.stdout;
				stderrWritable = process.stderr;
			}

			if (isCombinedOutput) {
				// Stream combined output to stdout only to avoid duplicates
				logger.debug('[exec] starting combined stream: %s', stdoutStreamUrl);
				streamLabels.push('combined');
				streamPromises.push(
					streamUrlToWritable(
						'combined',
						stdoutStreamUrl,
						stdoutWritable,
						streamAbortController.signal,
						logger
					)
				);
			} else {
				if (stdoutStreamUrl) {
					logger.debug('[exec] starting stdout stream: %s', stdoutStreamUrl);
					streamLabels.push('stdout');
					streamPromises.push(
						streamUrlToWritable(
							'stdout',
							stdoutStreamUrl,
							stdoutWritable,
							streamAbortController.signal,
							logger
						)
					);
				}

				if (stderrStreamUrl) {
					logger.debug('[exec] starting stderr stream: %s', stderrStreamUrl);
					streamLabels.push('stderr');
					streamPromises.push(
						streamUrlToWritable(
							'stderr',
							stderrStreamUrl,
							stderrWritable,
							streamAbortController.signal,
							logger
						)
					);
				}
			}

			logger.debug(
				'[exec] %d stream(s) started [%s], now long-polling executionGet',
				streamPromises.length,
				streamLabels.join(', ')
			);

			// Use server-side long-polling to wait for execution completion
			// This is more efficient than client-side polling and provides immediate
			// error detection if the sandbox is terminated
			const pollStart = Date.now();
			const finalExecution = await executionGet(client, {
				executionId: execution.executionId,
				orgId,
				wait: EXECUTION_WAIT_DURATION,
			});
			logger.debug(
				'[exec] executionGet returned in %dms: status=%s, exitCode=%s',
				Date.now() - pollStart,
				finalExecution.status,
				finalExecution.exitCode ?? 'undefined'
			);

			// Wait for all streams to reach EOF (Pulse blocks until true EOF).
			// Safety: execution is confirmed complete so all data has been written
			// and complete/v2 sent. If Pulse doesn't close the response within
			// a grace period (e.g. cross-server routing delay, stale metadata
			// cache), abort the streams to prevent an indefinite hang.
			if (streamPromises.length > 0) {
				logger.debug('[exec] waiting for %d stream(s) to EOF', streamPromises.length);
				const streamWaitStart = Date.now();
				let graceTriggered = false;
				const streamGrace = setTimeout(() => {
					graceTriggered = true;
					logger.debug(
						'[exec] stream grace period (5s) expired after execution complete — aborting streams'
					);
					streamAbortController.abort();
				}, 5_000);
				try {
					await Promise.all(streamPromises);
				} finally {
					clearTimeout(streamGrace);
				}
				logger.debug(
					'[exec] all streams done in %dms (graceTriggered=%s)',
					Date.now() - streamWaitStart,
					graceTriggered
				);
			}

			// Ensure stdout is fully flushed before continuing
			if (!options.json && process.stdout.writable) {
				await new Promise<void>((resolve) => {
					if (process.stdout.writableNeedDrain) {
						process.stdout.once('drain', () => resolve());
					} else {
						resolve();
					}
				});
			}

			const duration = Date.now() - started;
			const output = outputChunks.join('');
			const stdoutOutput =
				!isCombinedOutput && stdoutStreamUrl ? stdoutChunks.join('') : undefined;
			const stderrOutput =
				!isCombinedOutput && stderrStreamUrl ? stderrChunks.join('') : undefined;

			if (finalExecution.exitCode !== undefined && finalExecution.exitCode !== 0) {
				if (!options.json) {
					tui.error(`failed with exit code ${finalExecution.exitCode} in ${duration}ms`);
				}
				process.exitCode = finalExecution.exitCode;
			} else if (finalExecution.exitCode === undefined) {
				const failStatuses = ['failed', 'error', 'timeout', 'killed'];
				if (failStatuses.includes(finalExecution.status)) {
					if (!options.json) {
						tui.error(
							`Execution ${tui.bold(finalExecution.executionId)} ${finalExecution.status} in ${duration}ms`
						);
					}
					process.exitCode = 1;
				} else if (!options.json) {
					tui.info(
						`Execution ${tui.bold(finalExecution.executionId)} - Status: ${finalExecution.status}`
					);
				}
			}

			return {
				executionId: finalExecution.executionId,
				status: finalExecution.status,
				exitCode: finalExecution.exitCode,
				durationMs: finalExecution.durationMs,
				stdout: options.json ? stdoutOutput : undefined,
				stderr: options.json ? stderrOutput : undefined,
				output: options.json ? output : undefined,
				outputTruncated: finalExecution.outputTruncated ?? undefined,
				autoResumed: execution.autoResumed ?? undefined,
			};
		} finally {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		}
	},
});

async function streamUrlToWritable(
	label: string,
	url: string,
	writable: NodeJS.WritableStream,
	signal: AbortSignal,
	logger: Logger
): Promise<void> {
	const streamStart = Date.now();
	try {
		// Signal to Pulse that this is a v2 stream so it waits for v2 metadata
		// instead of falling back to the legacy download path on a short timeout.
		const v2Url = new URL(url);
		v2Url.searchParams.set('v', '2');
		logger.debug('[stream:%s] fetching: %s', label, v2Url.href);
		const response = await fetch(v2Url.href, { signal });
		logger.debug(
			'[stream:%s] response status=%d in %dms',
			label,
			response.status,
			Date.now() - streamStart
		);

		if (!response.ok || !response.body) {
			logger.debug('[stream:%s] not ok or no body — returning', label);
			return;
		}

		const reader = response.body.getReader();
		let chunks = 0;
		let totalBytes = 0;

		// Read until EOF - Pulse will block until data is available
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
				if (chunks <= 3 || chunks % 100 === 0) {
					logger.debug(
						'[stream:%s] chunk #%d: %d bytes (total: %d bytes, +%dms)',
						label,
						chunks,
						value.length,
						totalBytes,
						Date.now() - streamStart
					);
				}
				await writeAndDrain(writable, value);
			}
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger.debug('[stream:%s] aborted after %dms', label, Date.now() - streamStart);
			return;
		}
		logger.debug('[stream:%s] error after %dms: %s', label, Date.now() - streamStart, err);
	}
}

function createCaptureStream(onChunk: (chunk: string) => void): NodeJS.WritableStream {
	return new Writable({
		write(
			chunk: Buffer | string,
			_encoding: string,
			callback: (error?: Error | null) => void
		): void {
			const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
			onChunk(text);
			callback();
		},
	});
}

export default execSubcommand;
