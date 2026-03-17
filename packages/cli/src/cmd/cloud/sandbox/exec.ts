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
			// Go's time.ParseDuration accepts: "300ms", "1.5h", "2h45m", "5s", "1m", "1h"
			// Must contain at least one digit followed by a valid unit
			if (!/^\d/.test(opts.timeout) || !/[smh]/.test(opts.timeout)) {
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
			const execution = await sandboxExecute(client, {
				sandboxId: args.sandboxId,
				options: {
					command: args.command,
					timeout: opts.timeout,
					stream: opts.timestamps !== undefined ? { timestamps: opts.timestamps } : undefined,
				},
				orgId,
			});

			if (execution.autoResumed && !options.json) {
				tui.warning('Sandbox was automatically resumed from suspended state');
			}

			const stdoutStreamUrl = execution.stdoutStreamUrl;
			const stderrStreamUrl = execution.stderrStreamUrl;
			const streamAbortController = new AbortController();
			const streamPromises: Promise<void>[] = [];

			// Check if stdout and stderr are the same stream (combined output)
			const isCombinedOutput =
				stdoutStreamUrl && stderrStreamUrl && stdoutStreamUrl === stderrStreamUrl;

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
				logger.debug('using combined output stream (stdout === stderr): %s', stdoutStreamUrl);
				streamPromises.push(
					streamUrlToWritable(
						stdoutStreamUrl,
						stdoutWritable,
						streamAbortController.signal,
						logger
					)
				);
			} else {
				if (stdoutStreamUrl) {
					logger.debug('starting stdout stream from: %s', stdoutStreamUrl);
					streamPromises.push(
						streamUrlToWritable(
							stdoutStreamUrl,
							stdoutWritable,
							streamAbortController.signal,
							logger
						)
					);
				}

				if (stderrStreamUrl) {
					logger.debug('starting stderr stream from: %s', stderrStreamUrl);
					streamPromises.push(
						streamUrlToWritable(
							stderrStreamUrl,
							stderrWritable,
							streamAbortController.signal,
							logger
						)
					);
				}
			}

			// Use server-side long-polling to wait for execution completion
			// This is more efficient than client-side polling and provides immediate
			// error detection if the sandbox is terminated
			const finalExecution = await executionGet(client, {
				executionId: execution.executionId,
				orgId,
				wait: EXECUTION_WAIT_DURATION,
			});

			// Wait for all streams to reach EOF (Pulse blocks until true EOF)
			await Promise.all(streamPromises);

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

			if (!options.json) {
				if (finalExecution.exitCode === 0) {
					// no op
				} else if (finalExecution.exitCode !== undefined) {
					tui.error(`failed with exit code ${finalExecution.exitCode} in ${duration}ms`);
				} else {
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
				outputTruncated: finalExecution.outputTruncated || undefined,
				autoResumed: execution.autoResumed || undefined,
			};
		} finally {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		}
	},
});

async function streamUrlToWritable(
	url: string,
	writable: NodeJS.WritableStream,
	signal: AbortSignal,
	logger: Logger
): Promise<void> {
	try {
		logger.debug('fetching stream: %s', url);
		const response = await fetch(url, { signal });
		logger.debug('stream response status: %d', response.status);

		if (!response.ok || !response.body) {
			logger.debug('stream response not ok or no body');
			return;
		}

		const reader = response.body.getReader();

		// Read until EOF - Pulse will block until data is available
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				logger.debug('stream EOF');
				break;
			}

			if (value) {
				logger.debug('stream chunk: %d bytes', value.length);
				await writeAndDrain(writable, value);
			}
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger.debug('stream aborted');
			return;
		}
		logger.debug('stream error: %s', err);
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
