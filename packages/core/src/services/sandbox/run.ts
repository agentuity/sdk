import type { Logger } from '../../logger.ts';
import type { Readable, Writable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { APIClient, PaymentRequiredError } from '../api.ts';
import { sandboxCreate } from './create.ts';
import { sandboxDestroy } from './destroy.ts';
import { executionGet } from './execution.ts';
import { sandboxGetStatus } from './getStatus.ts';
import {
	createRunAbortSignal,
	DEFAULT_SANDBOX_EXECUTION_TIMEOUT_MS,
	executionStatusToExitCode,
	ExecutionCancelledError,
	ExecutionTimeoutError,
	formatWaitDuration,
	isTerminalExecutionStatus,
	isTerminalSandboxStatus,
	parseDurationMs,
	pulseV2StreamUrl,
	SANDBOX_RUN_TEARDOWN_GRACE_MS,
	SANDBOX_STATUS_WAIT_MS,
	sandboxStatusToRunResult,
	TERMINAL_SANDBOX_STATUSES,
	writeAndDrain,
} from './util.ts';
import { SandboxRunOptionsSchema, type SandboxRunResult } from './types.ts';
import { getServiceUrls } from '../config.ts';

const timingLogsEnabled = false;
const EXIT_CODE_FAST_WAIT_DURATION = '250ms';

/**
 * Creates a Writable stream that captures all chunks to a buffer array
 * and optionally tees (forwards) them to one or more user-provided streams.
 *
 * @param chunks - Array to collect Buffer chunks into
 * @param userStreams - Optional user-provided Writable stream(s) to forward chunks to
 * @returns A Writable stream that captures and optionally forwards data
 */
function createTeeWritable(chunks: Buffer[], ...userStreams: (Writable | undefined)[]): Writable {
	const tee = new PassThrough();

	// Always capture chunks to the buffer
	tee.on('data', (chunk: Buffer) => {
		chunks.push(chunk);
	});

	// Pipe to all provided user streams with proper backpressure handling
	for (const userStream of userStreams) {
		if (userStream) {
			tee.pipe(userStream, { end: false });
		}
	}

	return tee;
}

export const SandboxRunParamsSchema = z.object({
	options: SandboxRunOptionsSchema.describe('sandbox run options'),
	orgId: z.string().optional().describe('organization id'),
	region: z.string().optional().describe('region id'),
	apiKey: z.string().optional().describe('api key'),
	signal: z.custom<AbortSignal>().optional().describe('abort signal'),
	stdin: z.custom<Readable>().optional().describe('stdin readable stream'),
	stdout: z.custom<Writable>().optional().describe('stdout writable stream'),
	stderr: z.custom<Writable>().optional().describe('stderr writable stream'),
	logger: z.custom<Logger>().optional().describe('logger instance'),
});
export type SandboxRunParams = z.infer<typeof SandboxRunParamsSchema>;

/**
 * Creates a sandbox, executes a command, and waits for completion.
 *
 * This is a high-level convenience function that handles the full lifecycle:
 * creating a sandbox, streaming I/O, polling for completion, and cleanup.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including command options, I/O streams, and timeout settings
 * @returns The run result including exit code and duration
 * @throws {SandboxResponseError} If sandbox creation fails, execution times out, or is cancelled
 */
export async function sandboxRun(
	client: APIClient,
	params: SandboxRunParams
): Promise<SandboxRunResult> {
	const { options, orgId, region, apiKey, signal, stdin, stdout, stderr, logger } = params;
	const started = Date.now();
	if (timingLogsEnabled) console.error(`[TIMING] +0ms: sandbox run started`);

	let stdinStreamId: string | undefined;
	let stdinStreamUrl: string | undefined;

	// Handle stdin stream configuration:
	// - If stdin is "ignore", pass it through to skip stdin handling on server
	// - If stdin is an explicit stream ID, use it directly
	// - If stdin readable is provided, create a stream for it
	const stdinConfig = options.stream?.stdin;
	if (stdinConfig === 'ignore') {
		stdinStreamId = 'ignore';
		logger?.debug('stdin explicitly ignored');
	} else if (stdinConfig && stdinConfig !== 'ignore') {
		// User provided an explicit stream ID
		stdinStreamId = stdinConfig;
		logger?.debug('using provided stdin stream ID: %s', stdinStreamId);
	} else if (stdin && region && apiKey) {
		const streamResult = await createStdinStream(region, apiKey, orgId, logger);
		stdinStreamId = streamResult.id;
		stdinStreamUrl = streamResult.url;
		logger?.debug('created stdin stream: %s', stdinStreamId);
	}

	const createResponse = await sandboxCreate(client, {
		options: {
			...options,
			command: {
				exec: options.command.exec,
				files: options.command.files,
				mode: 'oneshot',
			},
			stream: {
				...options.stream,
				stdin: stdinStreamId,
			},
		},
		orgId,
	});

	const sandboxId = createResponse.sandboxId;
	const stdoutStreamUrl = createResponse.stdoutStreamUrl;
	const stderrStreamUrl = createResponse.stderrStreamUrl;
	const executionTimeoutMs = options.timeout?.execution
		? parseDurationMs(options.timeout.execution)
		: DEFAULT_SANDBOX_EXECUTION_TIMEOUT_MS;
	const runDeadlineAt = started + executionTimeoutMs + SANDBOX_RUN_TEARDOWN_GRACE_MS;
	const {
		signal: runSignal,
		cleanup: cleanupRunSignal,
		isRunTimeout,
	} = createRunAbortSignal({
		userSignal: signal,
		deadlineAt: runDeadlineAt,
	});

	logger?.debug(
		'sandbox created: %s, stdoutUrl: %s, stderrUrl: %s',
		sandboxId,
		stdoutStreamUrl ?? 'none',
		stderrStreamUrl ?? 'none'
	);
	if (timingLogsEnabled)
		console.error(`[TIMING] +${Date.now() - started}ms: sandbox created (${sandboxId})`);

	const abortController = new AbortController();
	runSignal.addEventListener('abort', () => abortController.abort(), { once: true });
	/** Output streams only — stdin must never block run completion. */
	const outputStreamPromises: Promise<void>[] = [];

	// Create capture buffers for stdout/stderr
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];

	try {
		// Start stdin streaming if we have stdin and a stream URL. Stdin is
		// best-effort input and may stay open in non-TTY environments; never
		// include it in output drain waits.
		if (stdin && stdinStreamUrl && apiKey) {
			void streamStdinToUrl(stdin, stdinStreamUrl, apiKey, abortController.signal, logger).catch(
				() => {
					// Abort or early close is expected once the run finishes.
				}
			);
		}

		// Check if stdout and stderr are the same stream (combined output)
		const isCombinedOutput =
			stdoutStreamUrl && stderrStreamUrl && stdoutStreamUrl === stderrStreamUrl;

		if (isCombinedOutput) {
			// Stream combined output to stdout only to avoid duplicates
			if (stdoutStreamUrl) {
				logger?.debug('using combined output stream (stdout === stderr)');
				const teeStream = createTeeWritable(stdoutChunks, stdout);
				const combinedPromise = streamUrlToWritable(
					stdoutStreamUrl,
					teeStream,
					abortController.signal,
					logger,
					started
				);
				outputStreamPromises.push(combinedPromise);
			}
		} else {
			// Start stdout streaming with capture
			if (stdoutStreamUrl) {
				const teeStream = createTeeWritable(stdoutChunks, stdout);
				const stdoutPromise = streamUrlToWritable(
					stdoutStreamUrl,
					teeStream,
					abortController.signal,
					logger,
					started
				);
				outputStreamPromises.push(stdoutPromise);
			}

			// Start stderr streaming with capture
			if (stderrStreamUrl) {
				const teeStream = createTeeWritable(stderrChunks, stderr);
				const stderrPromise = streamUrlToWritable(
					stderrStreamUrl,
					teeStream,
					abortController.signal,
					logger,
					started
				);
				outputStreamPromises.push(stderrPromise);
			}
		}

		// Wait for execution completion in parallel with stream consumption. The old
		// flow waited for stream EOF first and only then started polling for the
		// final exit code, which adds avoidable tail latency now that create returns
		// an execution ID immediately for oneshot sandboxes.
		let finalExecution:
			| {
					exitCode?: number;
					status: string;
			  }
			| undefined;
		if (createResponse.executionId) {
			logger?.debug(
				'waiting for execution %s and %d output stream(s) in parallel',
				createResponse.executionId,
				outputStreamPromises.length
			);
			const completionPromise = waitForRunCompletion(
				client,
				sandboxId,
				createResponse.executionId,
				orgId,
				runSignal,
				logger,
				runDeadlineAt
			);
			const streamsPromise = waitForStreamsToDrain(
				outputStreamPromises,
				runSignal,
				abortController,
				sandboxId,
				isRunTimeout
			);

			try {
				// Resolve execution/status first so a hung Pulse reader cannot block the
				// whole run until the client deadline. Output stream fetches still run in parallel.
				const [execution] = await Promise.all([completionPromise, streamsPromise]);
				finalExecution = execution;
				abortController.abort();
			} catch (error) {
				throw mapRunAbortError(
					error,
					runSignal,
					isRunTimeout,
					sandboxId,
					createResponse.executionId
				);
			}
		} else {
			logger?.debug(
				'missing executionId on create response, falling back to stream-first completion'
			);
			try {
				await waitForStreamsToDrain(
					outputStreamPromises,
					runSignal,
					abortController,
					sandboxId,
					isRunTimeout
				);
			} catch (error) {
				throw mapRunAbortError(error, runSignal, isRunTimeout, sandboxId);
			}
		}

		if (timingLogsEnabled)
			console.error(`[TIMING] +${Date.now() - started}ms: completion wait finished`);
		logger?.debug('completion wait finished, resolving final exit code');

		// Stream EOF means the sandbox is done — hadron only closes streams after the
		// container exits. Poll for the exit code with retries because the lifecycle
		// event (carrying the exit code) may still be in flight to Catalyst when the
		// stream completes.
		//
		// Hadron drains container logs for up to 5s after exit, then closes the
		// stream, then sends the lifecycle event in a goroutine. So the exit code
		// typically arrives at Catalyst 5–7s after the container exits. We use a
		// linear 1s polling interval (not exponential backoff) so we don't overshoot
		// the window — 15 attempts × 1s = 15s total, which comfortably covers the
		// drain + lifecycle propagation delay.
		let exitCode =
			finalExecution != null
				? (executionStatusToExitCode(finalExecution.status, finalExecution.exitCode) ?? 0)
				: 0;
		const statusPollStart = Date.now();
		let shouldWaitForSandboxStatus = finalExecution?.exitCode == null;
		let sandboxStatusReconciled = false;
		if (finalExecution?.exitCode == null) {
			if (createResponse.executionId && finalExecution?.status === 'completed') {
				try {
					const execution = await executionGet(client, {
						executionId: createResponse.executionId,
						orgId,
						wait: EXIT_CODE_FAST_WAIT_DURATION,
						signal: runSignal,
					});
					if (execution.exitCode != null) {
						exitCode = execution.exitCode;
						finalExecution.exitCode = execution.exitCode;
						shouldWaitForSandboxStatus = false;
						logger?.debug(
							'[run] exit code %d found from fast execution retry (+%dms)',
							exitCode,
							Date.now() - statusPollStart
						);
					}
				} catch (err) {
					if (!(err instanceof DOMException && err.name === 'AbortError')) {
						logger?.debug(
							'[run] fast execution exit code retry failed (+%dms): %s',
							Date.now() - statusPollStart,
							err
						);
					}
				}
			}
		}
		if (shouldWaitForSandboxStatus && runSignal.aborted === false) {
			try {
				const remainingMs = runDeadlineAt - Date.now();
				const sandboxStatus = await sandboxGetStatus(client, {
					sandboxId,
					orgId,
					waitForStatus: [...TERMINAL_SANDBOX_STATUSES],
					waitMs: Math.min(15_000, Math.max(0, remainingMs)),
					signal: runSignal,
				});
				const reconciled = sandboxStatusToRunResult(sandboxStatus);
				if (reconciled) {
					exitCode =
						executionStatusToExitCode(reconciled.status, reconciled.exitCode) ?? exitCode;
					sandboxStatusReconciled = true;
					logger?.debug(
						'[run] sandbox status reconciled to exit=%s status=%s (+%dms)',
						reconciled.exitCode ?? 'undefined',
						reconciled.status,
						Date.now() - statusPollStart
					);
				} else {
					logger?.debug(
						'[run] sandbox status wait expired with status=%s (+%dms)',
						sandboxStatus.status,
						Date.now() - statusPollStart
					);
				}
			} catch (err) {
				if (isRunTimeout(runSignal.reason)) {
					throw new ExecutionTimeoutError({
						message: 'Sandbox execution timed out',
						sandboxId,
						executionId: createResponse.executionId,
					});
				}
				if (!(err instanceof DOMException && err.name === 'AbortError')) {
					logger?.debug(
						'[run] sandboxGetStatus server-side wait failed (+%dms): %s',
						Date.now() - statusPollStart,
						err
					);
				}
			}
		}
		if (
			finalExecution &&
			finalExecution.exitCode == null &&
			isTerminalExecutionStatus(finalExecution.status) &&
			finalExecution.status !== 'completed' &&
			!sandboxStatusReconciled
		) {
			exitCode = executionStatusToExitCode(finalExecution.status) ?? 1;
			logger?.debug(
				'[run] using fallback exit code %d for terminal execution status=%s',
				exitCode,
				finalExecution.status
			);
		}
		if (exitCode === 0) {
			if (finalExecution?.exitCode != null) {
				logger?.debug('[run] using execution exit code 0 from long-poll result');
			} else {
				logger?.debug(
					'[run] exit code wait finished with default 0 (+%dms)',
					Date.now() - statusPollStart
				);
			}
		}

		if (timingLogsEnabled)
			console.error(
				`[TIMING] +${Date.now() - started}ms: sandboxGet complete (exit: ${exitCode})`
			);

		// Build captured output strings
		const capturedStdout = Buffer.concat(stdoutChunks).toString('utf-8');
		const capturedStderr = isCombinedOutput
			? capturedStdout
			: Buffer.concat(stderrChunks).toString('utf-8');

		return {
			sandboxId,
			exitCode,
			durationMs: Date.now() - started,
			stdout: capturedStdout,
			stderr: capturedStderr,
		};
	} catch (error) {
		abortController.abort();
		try {
			await sandboxDestroy(client, { sandboxId, orgId });
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	} finally {
		cleanupRunSignal();
	}
}

function mapRunAbortError(
	error: unknown,
	runSignal: AbortSignal,
	isRunTimeout: (reason: unknown) => boolean,
	sandboxId: string,
	executionId?: string
): unknown {
	if (isRunTimeout(runSignal.reason)) {
		return new ExecutionTimeoutError({
			message: 'Sandbox execution timed out',
			sandboxId,
			executionId,
		});
	}
	if (error instanceof ExecutionCancelledError) {
		return error;
	}
	if (error instanceof DOMException && error.name === 'AbortError') {
		return new ExecutionCancelledError({
			message: 'Sandbox execution cancelled',
			sandboxId,
		});
	}
	return error;
}

async function waitForRunCompletion(
	client: APIClient,
	sandboxId: string,
	executionId: string,
	orgId: string | undefined,
	signal: AbortSignal | undefined,
	logger: Logger | undefined,
	deadlineAt: number
): Promise<{ exitCode?: number; status: string }> {
	const completionAbortController = new AbortController();
	let onAbort: (() => void) | undefined;
	if (signal) {
		onAbort = () => completionAbortController.abort(signal.reason);
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener('abort', onAbort, { once: true });
		}
	}

	try {
		const completionSignal = completionAbortController.signal;
		const executionPromise = waitForExecutionCompletion(
			client,
			executionId,
			orgId,
			completionSignal,
			logger,
			deadlineAt
		);
		const statusPromise = waitForSandboxStatusCompletion(
			client,
			sandboxId,
			orgId,
			completionSignal,
			logger,
			deadlineAt
		).catch((err) => {
			if (completionSignal.aborted) {
				throw err;
			}
			logger?.debug('[run] sandbox status completion wait failed: %s', err);
			return new Promise<never>(() => {});
		});

		const result = await Promise.race([executionPromise, statusPromise]);
		return result;
	} finally {
		if (onAbort && signal) {
			signal.removeEventListener('abort', onAbort);
		}
	}
}

async function waitForExecutionCompletion(
	client: APIClient,
	executionId: string,
	orgId: string | undefined,
	signal: AbortSignal | undefined,
	logger: Logger | undefined,
	deadlineAt: number
): Promise<{ exitCode?: number; status: string }> {
	while (true) {
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		const remainingMs = deadlineAt - Date.now();
		if (remainingMs <= 0) {
			throw new DOMException('Sandbox run timeout exceeded', 'TimeoutError');
		}

		const result = await executionGet(client, {
			executionId,
			orgId,
			wait: formatWaitDuration(remainingMs),
			signal,
		});
		logger?.debug(
			'[run] execution wait: id=%s status=%s exit=%s remaining=%dms',
			executionId,
			result.status,
			result.exitCode ?? 'undefined',
			remainingMs
		);

		if (isTerminalExecutionStatus(result.status)) {
			return {
				exitCode: result.exitCode,
				status: result.status,
			};
		}
	}
}

async function waitForSandboxStatusCompletion(
	client: APIClient,
	sandboxId: string,
	orgId: string | undefined,
	signal: AbortSignal | undefined,
	logger: Logger | undefined,
	deadlineAt: number
): Promise<{ exitCode?: number; status: string }> {
	while (true) {
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		const remainingMs = deadlineAt - Date.now();
		if (remainingMs <= 0) {
			throw new DOMException('Sandbox run timeout exceeded', 'TimeoutError');
		}

		const result = await sandboxGetStatus(client, {
			sandboxId,
			orgId,
			waitForStatus: [...TERMINAL_SANDBOX_STATUSES],
			waitMs: Math.min(SANDBOX_STATUS_WAIT_MS, remainingMs),
			signal,
		});
		logger?.debug(
			'[run] sandbox status wait: sandbox=%s status=%s exit=%s remaining=%dms',
			sandboxId,
			result.status,
			result.exitCode ?? 'undefined',
			remainingMs
		);

		const terminalResult = sandboxStatusToRunResult(result);
		if (terminalResult) {
			return terminalResult;
		}

		if (!isTerminalSandboxStatus(result.status)) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
}

async function waitForStreamsToDrain(
	streamPromises: Promise<void>[],
	signal: AbortSignal | undefined,
	abortController: AbortController,
	sandboxId: string,
	isRunTimeout: (reason: unknown) => boolean
): Promise<void> {
	if (streamPromises.length === 0) {
		return;
	}

	if (signal) {
		let onAbort: (() => void) | undefined;
		try {
			await Promise.race([
				Promise.allSettled(streamPromises).then(() => undefined),
				new Promise<never>((_, reject) => {
					onAbort = () => {
						abortController.abort();
						if (isRunTimeout(signal.reason)) {
							reject(new DOMException('Sandbox run timeout exceeded', 'TimeoutError'));
							return;
						}
						reject(
							new ExecutionCancelledError({
								message: 'Sandbox execution cancelled',
								sandboxId,
							})
						);
					};
					if (signal.aborted) {
						onAbort();
					} else {
						signal.addEventListener('abort', onAbort, { once: true });
					}
				}),
			]);
		} finally {
			if (onAbort) {
				signal.removeEventListener('abort', onAbort);
			}
		}
		return;
	}

	await Promise.allSettled(streamPromises);
}

async function createStdinStream(
	region: string,
	apiKey: string,
	orgId?: string,
	logger?: Logger
): Promise<{ id: string; url: string }> {
	const urls = getServiceUrls(region);
	const streamBaseUrl = urls.stream;

	// Build URL with orgId query param for CLI token validation
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `${streamBaseUrl}${queryString ? `?${queryString}` : ''}`;
	logger?.trace('creating stdin stream: %s', url);

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			name: `sandbox-stdin-${Date.now()}`,
		}),
	});

	if (!response.ok) {
		if (response.status === 402) {
			throw new PaymentRequiredError({
				url: url,
			});
		}
		throw new Error(`Failed to create stdin stream: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as { id: string };
	logger?.debug('created stdin stream: %s', data.id);

	// Include orgId in the URL for subsequent PUT requests (needed for CLI token auth)
	const putQueryString = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
	return {
		id: data.id,
		url: `${streamBaseUrl}/${data.id}${putQueryString}`,
	};
}

async function streamStdinToUrl(
	stdin: Readable,
	url: string,
	apiKey: string,
	signal: AbortSignal,
	logger?: Logger
): Promise<void> {
	try {
		logger?.debug('streaming stdin to: %s', url);

		// Convert Node.js Readable to a web ReadableStream for fetch body
		let controllerClosed = false;
		const webStream = new ReadableStream({
			start(controller) {
				stdin.on('data', (chunk: Buffer) => {
					if (!signal.aborted && !controllerClosed) {
						controller.enqueue(chunk);
					}
				});
				stdin.on('end', () => {
					if (!controllerClosed) {
						controllerClosed = true;
						controller.close();
					}
				});
				stdin.on('error', (err) => {
					if (!controllerClosed) {
						controllerClosed = true;
						controller.error(err);
					}
				});
				signal.addEventListener('abort', () => {
					if (!controllerClosed) {
						controllerClosed = true;
						try {
							controller.close();
						} catch {
							// Stream may already be closed after stdin end.
						}
					}
				});
			},
		});

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			body: webStream,
			signal,
			duplex: 'half',
		} as RequestInit);

		if (!response.ok) {
			logger?.debug('stdin stream PUT failed: %d', response.status);
		} else {
			logger?.debug('stdin stream completed');
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger?.debug('stdin stream aborted (expected on completion)');
		} else {
			logger?.debug('stdin stream error: %s', err);
		}
	}
}

async function streamUrlToWritable(
	url: string,
	writable: Writable,
	signal: AbortSignal,
	logger?: Logger,
	_started?: number
): Promise<void> {
	const streamStart = Date.now();
	try {
		const fetchUrl = pulseV2StreamUrl(url);
		logger?.debug('[stream] fetching: %s', fetchUrl);
		const response = await fetch(fetchUrl, { signal });
		logger?.debug(
			'[stream] response status=%d in %dms',
			response.status,
			Date.now() - streamStart
		);

		if (!response.ok || !response.body) {
			logger?.debug('[stream] not ok or no body (status=%d) — returning empty', response.status);
			return;
		}

		const reader = response.body.getReader();
		let chunks = 0;
		let totalBytes = 0;

		// Read until EOF - Pulse will block until data is available
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				logger?.debug(
					'[stream] EOF after %dms (%d chunks, %d bytes)',
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
					logger?.debug(
						'[stream] chunk #%d: %d bytes (total: %d bytes, +%dms)',
						chunks,
						value.length,
						totalBytes,
						Date.now() - streamStart
					);
				}
				await writeAndDrain(writable, value);
			}
		}
		// Signal end-of-stream to the tee/pipe chain so downstream
		// consumers (e.g. process.stdout pipe) know no more data is coming.
		writable.end();
		if ('once' in writable) {
			await finished(writable as NodeJS.WritableStream).catch(() => {
				// Ignore finish errors here; the main read/write path already
				// reported meaningful stream errors.
			});
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger?.debug('[stream] aborted after %dms', Date.now() - streamStart);
			return;
		}
		logger?.debug('[stream] error after %dms: %s', Date.now() - streamStart, err);
	}
}
