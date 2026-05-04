import { z } from 'zod';
import { Writable } from 'node:stream';
import { ErrorCode } from '../../../errors.ts';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient, detectNullStream, resolveSandboxTarget } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxExecute, executionGet } from '@agentuity/server';
import { streamUrlToWritable } from '../../../utils/stream-url.ts';

const EXECUTION_WAIT_DURATION = '5m';
const EMPTY_STREAM_FAST_POLL_MS = 100;
const EMPTY_STREAM_FAST_TIMEOUT_MS = 2000;

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
			quiet: z
				.boolean()
				.default(false)
				.optional()
				.describe('Suppress output (do not create stdout/stderr streams)'),
		}),
		response: SandboxExecResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		if (opts.timeout) {
			if (!/^(?:0|(\d+(\.\d+)?(ns|us|[µμ]s|ms|s|m|h))+)$/.test(opts.timeout)) {
				tui.fatal(
					`Invalid timeout format '${opts.timeout}': expected duration like '5s', '1m', '1h', '300ms'`,
					ErrorCode.INVALID_ARGUMENT
				);
			}
		}

		const { region, orgId } = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			args.sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		// Detect if stdout/stderr are redirected to /dev/null
		const stdoutIsNull = detectNullStream(1);
		const stderrIsNull = detectNullStream(2);

		// Build stream configuration
		const streamConfig: {
			timestamps?: boolean;
			stdout?: string;
			stderr?: string;
		} = {
			timestamps: opts.timestamps,
		};

		// --quiet: suppress all output streams (no server streams, no local capture)
		if (opts.quiet) {
			streamConfig.stdout = 'ignore';
			streamConfig.stderr = 'ignore';
		} else if (!options.json) {
			// Auto-detect /dev/null redirection (only when not in JSON mode)
			// In JSON mode we need output for the response, so keep streams even if redirected
			if (stdoutIsNull) {
				streamConfig.stdout = 'ignore';
			}
			if (stderrIsNull) {
				streamConfig.stderr = 'ignore';
			}
		}

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
					stream: streamConfig,
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
			const streamPromises: Promise<{ bytesRead: number; chunks: number }>[] = [];
			const streamLabels: string[] = [];

			const isCombinedOutput =
				stdoutStreamUrl && stderrStreamUrl && stdoutStreamUrl === stderrStreamUrl;
			logger.debug(
				'[exec] stream mode: combined=%s, stdoutUrl=%s, stderrUrl=%s',
				isCombinedOutput,
				stdoutStreamUrl ?? 'none',
				stderrStreamUrl ?? 'none'
			);

			const outputChunks: string[] = [];
			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];

			const stdoutWritable: NodeJS.WritableStream =
				options.json || stdoutIsNull
					? createCaptureStream((chunk) => {
							stdoutChunks.push(chunk);
							outputChunks.push(chunk);
						})
					: process.stdout;
			const stderrWritable: NodeJS.WritableStream =
				options.json || stderrIsNull
					? createCaptureStream((chunk) => {
							stderrChunks.push(chunk);
							outputChunks.push(chunk);
						})
					: process.stderr;

			if (isCombinedOutput) {
				logger.debug('[exec] starting combined stream: %s', stdoutStreamUrl);
				streamLabels.push('combined');
				streamPromises.push(
					streamUrlToWritable(stdoutStreamUrl!, stdoutWritable, logger, {
						signal: streamAbortController.signal,
						label: 'combined',
						raw: true,
						v2: true,
					})
				);
			} else {
				if (stdoutStreamUrl) {
					logger.debug('[exec] starting stdout stream: %s', stdoutStreamUrl);
					streamLabels.push('stdout');
					streamPromises.push(
						streamUrlToWritable(stdoutStreamUrl, stdoutWritable, logger, {
							signal: streamAbortController.signal,
							label: 'stdout',
							raw: true,
							v2: true,
						})
					);
				}

				if (stderrStreamUrl) {
					logger.debug('[exec] starting stderr stream: %s', stderrStreamUrl);
					streamLabels.push('stderr');
					streamPromises.push(
						streamUrlToWritable(stderrStreamUrl, stderrWritable, logger, {
							signal: streamAbortController.signal,
							label: 'stderr',
							raw: true,
							v2: true,
						})
					);
				}
			}

			logger.debug(
				'[exec] %d stream(s) started [%s], now long-polling executionGet',
				streamPromises.length,
				streamLabels.join(', ')
			);

			let finalExecution: Awaited<ReturnType<typeof executionGet>>;
			let streamResults: { bytesRead: number; chunks: number }[] | undefined;
			const pollStart = Date.now();
			const executionWaitAbortController = new AbortController();
			try {
				const executionWaitPromise = executionGet(client, {
					executionId: execution.executionId,
					orgId,
					wait: EXECUTION_WAIT_DURATION,
					signal: executionWaitAbortController.signal,
				});

				if (streamPromises.length > 0) {
					const winner = await Promise.race([
						executionWaitPromise.then((result) => ({ type: 'execution' as const, result })),
						Promise.all(streamPromises).then((results) => ({
							type: 'streams' as const,
							results,
						})),
					]);

					if (winner.type === 'execution') {
						finalExecution = winner.result;
					} else {
						streamResults = winner.results;
						const bytesRead = streamResults.reduce(
							(sum, result) => sum + result.bytesRead,
							0
						);
						if (bytesRead === 0) {
							logger.debug(
								'[exec] all streams EOF with 0 bytes before executionGet completed — switching to fast terminal poll'
							);
							void executionWaitPromise.catch(() => undefined);
							executionWaitAbortController.abort();
							finalExecution = await waitForTerminalExecutionFast(
								client,
								execution.executionId,
								orgId,
								logger
							);
						} else {
							finalExecution = await executionWaitPromise;
						}
					}
				} else {
					finalExecution = await executionWaitPromise;
				}
			} catch (err) {
				streamAbortController.abort();
				throw err;
			}
			logger.debug(
				'[exec] executionGet returned in %dms: status=%s, exitCode=%s',
				Date.now() - pollStart,
				finalExecution.status,
				finalExecution.exitCode ?? 'undefined'
			);

			if (streamPromises.length > 0) {
				logger.debug('[exec] waiting for %d stream(s) to EOF', streamPromises.length);
				const streamWaitStart = Date.now();
				let graceTriggered = false;
				if (!streamResults) {
					const streamGraceMs = 500;
					const streamGrace = setTimeout(() => {
						graceTriggered = true;
						logger.debug(
							'[exec] stream grace period (%dms) expired after execution complete — aborting streams',
							streamGraceMs
						);
						streamAbortController.abort();
					}, streamGraceMs);
					try {
						streamResults = await Promise.all(streamPromises);
					} finally {
						clearTimeout(streamGrace);
					}
				}
				logger.debug(
					'[exec] all streams done in %dms (graceTriggered=%s)',
					Date.now() - streamWaitStart,
					graceTriggered
				);
			}

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

const TERMINAL_EXECUTION_STATUSES = new Set([
	'completed',
	'failed',
	'error',
	'timeout',
	'killed',
	'cancelled',
]);

async function waitForTerminalExecutionFast(
	client: Parameters<typeof executionGet>[0],
	executionId: string,
	orgId: string,
	logger: Parameters<typeof streamUrlToWritable>[2]
) {
	const deadline = Date.now() + EMPTY_STREAM_FAST_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const info = await executionGet(client, { executionId, orgId });
		if (TERMINAL_EXECUTION_STATUSES.has(info.status)) {
			logger.debug(
				'[exec] fast terminal poll observed status=%s for executionId=%s',
				info.status,
				executionId
			);
			return info;
		}
		await new Promise((resolve) => setTimeout(resolve, EMPTY_STREAM_FAST_POLL_MS));
	}

	logger.debug(
		'[exec] fast terminal poll timed out after %dms for executionId=%s, falling back to long-poll',
		EMPTY_STREAM_FAST_TIMEOUT_MS,
		executionId
	);
	return executionGet(client, { executionId, orgId, wait: EXECUTION_WAIT_DURATION });
}

export default execSubcommand;
