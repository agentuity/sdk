import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxExecute, executionGet } from '@agentuity/server';
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

		try {
			const execution = await sandboxExecute(client, {
				sandboxId: args.sandboxId,
				options: {
					command: args.command,
					timeout: opts.timeout,
				},
				orgId,
			});

			const streamUrl = execution.stdoutStreamUrl;
			let streamAbortController: AbortController | undefined;
			let streamReceivedData = false;

			if (streamUrl) {
				streamAbortController = new AbortController();
				logger.debug('starting stream from: %s', streamUrl);
				streamOutput(
					streamUrl,
					(chunk) => {
						streamReceivedData = true;
						if (options.json) {
							outputChunks.push(chunk);
						} else {
							process.stdout.write(chunk);
						}
					},
					streamAbortController.signal,
					logger
				).catch((err) => {
					logger.debug('stream error: %s', err);
				});
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

			// Give stream time to flush before aborting
			await sleep(100);
			streamAbortController?.abort();

			// If we didn't receive data from streaming, try one final fetch
			if (streamUrl && !streamReceivedData) {
				try {
					logger.debug('fetching final stream content from: %s', streamUrl);
					const response = await fetch(streamUrl);
					if (response.ok && response.body) {
						const text = await response.text();
						if (text) {
							if (options.json) {
								outputChunks.push(text);
							} else {
								process.stdout.write(text);
							}
						}
					}
				} catch (err) {
					logger.debug('final stream fetch error: %s', err);
				}
			}

			const duration = Date.now() - started;
			const output = outputChunks.join('');

			if (!options.json) {
				if (finalExecution.exitCode === 0) {
					tui.success(`completed in ${duration}ms with exit code ${finalExecution.exitCode}`);
				} else if (finalExecution.exitCode !== undefined) {
					tui.error(`failed with exit code ${finalExecution.exitCode} in ${duration}ms`);
				} else {
					tui.info(`Execution ${tui.bold(finalExecution.executionId)} - Status: ${finalExecution.status}`);
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

async function streamOutput(
	url: string,
	onOutput: (chunk: string) => void,
	signal: AbortSignal,
	logger: Logger
): Promise<void> {
	const maxRetries = 10;
	const retryDelay = 200;

	for (let attempt = 0; attempt < maxRetries && !signal.aborted; attempt++) {
		try {
			if (attempt > 0) {
				logger.debug('stream retry attempt %d', attempt + 1);
				await sleep(retryDelay);
			}

			logger.debug('fetching stream: %s', url);
			const response = await fetch(url, { signal });
			logger.debug('stream response status: %d', response.status);

			if (!response.ok || !response.body) {
				logger.debug('stream response not ok or no body');
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let receivedData = false;

			while (!signal.aborted) {
				const { done, value } = await reader.read();
				if (done) {
					logger.debug('stream done, received data: %s', receivedData);
					if (receivedData) {
						return;
					}
					break;
				}

				const text = decoder.decode(value, { stream: true });
				if (text) {
					receivedData = true;
					logger.debug('stream chunk: %d bytes', text.length);
					onOutput(text);
				}
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				logger.debug('stream aborted (expected on completion)');
				return;
			}
			logger.debug('stream caught error: %s', err);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default execSubcommand;
