import { z } from 'zod';
import { Writable } from 'node:stream';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxExecute, executionGet, writeAndDrain } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 7200;

const SandboxExecResponseSchema = z.object({
	executionId: z.string().describe('Unique execution identifier'),
	status: z.string().describe('Execution status'),
	exitCode: z.number().optional().describe('Exit code (if completed)'),
	durationMs: z.number().optional().describe('Duration in milliseconds (if completed)'),
	output: z.string().optional().describe('Combined stdout/stderr output'),
});

export const execSubcommand = createCommand({
	name: 'exec',
	aliases: ['execute'],
	description: 'Execute a command in a running sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
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
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		const abortController = new AbortController();
		const handleSignal = () => {
			abortController.abort();
		};
		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		const outputChunks: string[] = [];

		// For JSON output, capture to buffer; otherwise stream to process
		const stdout = options.json
			? createCaptureStream((chunk) => outputChunks.push(chunk))
			: process.stdout;
		const stderr = options.json
			? createCaptureStream((chunk) => outputChunks.push(chunk))
			: process.stderr;

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

			const stdoutStreamUrl = execution.stdoutStreamUrl;
			const stderrStreamUrl = execution.stderrStreamUrl;
			const streamAbortController = new AbortController();
			const streamPromises: Promise<void>[] = [];

			// Check if stdout and stderr are the same stream (combined output)
			const isCombinedOutput =
				stdoutStreamUrl && stderrStreamUrl && stdoutStreamUrl === stderrStreamUrl;

			if (isCombinedOutput) {
				// Stream combined output to stdout only to avoid duplicates
				logger.debug('using combined output stream (stdout === stderr): %s', stdoutStreamUrl);
				streamPromises.push(
					streamUrlToWritable(stdoutStreamUrl, stdout, streamAbortController.signal, logger)
				);
			} else {
				if (stdoutStreamUrl) {
					logger.debug('starting stdout stream from: %s', stdoutStreamUrl);
					streamPromises.push(
						streamUrlToWritable(stdoutStreamUrl, stdout, streamAbortController.signal, logger)
					);
				}

				if (stderrStreamUrl) {
					logger.debug('starting stderr stream from: %s', stderrStreamUrl);
					streamPromises.push(
						streamUrlToWritable(stderrStreamUrl, stderr, streamAbortController.signal, logger)
					);
				}
			}

			let attempts = 0;
			let finalExecution = execution;

			while (attempts < MAX_POLL_ATTEMPTS) {
				if (abortController.signal.aborted) {
					throw new Error('Execution cancelled');
				}

				await sleep(POLL_INTERVAL_MS);
				attempts++;

				try {
					const execInfo = await executionGet(client, {
						executionId: execution.executionId,
						orgId,
					});

					if (
						execInfo.status === 'completed' ||
						execInfo.status === 'failed' ||
						execInfo.status === 'timeout' ||
						execInfo.status === 'cancelled'
					) {
						finalExecution = {
							executionId: execInfo.executionId,
							status: execInfo.status,
							exitCode: execInfo.exitCode,
							durationMs: execInfo.durationMs,
						};
						break;
					}
				} catch {
					continue;
				}
			}

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
				output: options.json ? output : undefined,
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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default execSubcommand;
