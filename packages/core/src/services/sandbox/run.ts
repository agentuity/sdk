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
import { ExecutionCancelledError, writeAndDrain } from './util.ts';
import { SandboxRunOptionsSchema, type SandboxRunResult } from './types.ts';
import { getServiceUrls } from '../config.ts';

const timingLogsEnabled = false;
const EXECUTION_WAIT_DURATION = '5m';
const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);

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

	logger?.debug(
		'sandbox created: %s, stdoutUrl: %s, stderrUrl: %s',
		sandboxId,
		stdoutStreamUrl ?? 'none',
		stderrStreamUrl ?? 'none'
	);
	if (timingLogsEnabled)
		console.error(`[TIMING] +${Date.now() - started}ms: sandbox created (${sandboxId})`);

	const abortController = new AbortController();
	const streamPromises: Promise<void>[] = [];

	// Create capture buffers for stdout/stderr
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];

	try {
		// Start stdin streaming if we have stdin and a stream URL
		if (stdin && stdinStreamUrl && apiKey) {
			const stdinPromise = streamStdinToUrl(
				stdin,
				stdinStreamUrl,
				apiKey,
				abortController.signal,
				logger
			);
			streamPromises.push(stdinPromise);
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
				streamPromises.push(combinedPromise);
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
				streamPromises.push(stdoutPromise);
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
				streamPromises.push(stderrPromise);
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
				'waiting for execution %s and %d stream(s) in parallel',
				createResponse.executionId,
				streamPromises.length
			);
			const executionPromise = waitForExecutionCompletion(
				client,
				createResponse.executionId,
				orgId,
				signal,
				logger,
				started
			);

			finalExecution = signal
				? await raceWithAbort(executionPromise, signal, abortController, sandboxId)
				: await executionPromise;
			await waitForStreamsToDrain(streamPromises, signal, abortController, sandboxId);
		} else {
			logger?.debug(
				'missing executionId on create response, falling back to stream-first completion'
			);
			await waitForStreamsToDrain(streamPromises, signal, abortController, sandboxId);
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
		let exitCode = finalExecution?.exitCode ?? 0;
		const statusPollStart = Date.now();
		if (finalExecution?.exitCode == null) {
			try {
				const sandboxStatus = await sandboxGetStatus(client, {
					sandboxId,
					orgId,
					waitForStatus: ['terminated', 'failed'],
					waitMs: 15000,
				});
				if (sandboxStatus.exitCode != null) {
					exitCode = sandboxStatus.exitCode;
					logger?.debug(
						'[run] exit code %d found after server-side wait (+%dms)',
						exitCode,
						Date.now() - statusPollStart
					);
				} else if (sandboxStatus.status === 'failed') {
					exitCode = 1;
					logger?.debug(
						'[run] sandbox failed after server-side wait (+%dms)',
						Date.now() - statusPollStart
					);
				} else if (sandboxStatus.status === 'terminated') {
					logger?.debug(
						'[run] sandbox terminated without exit code after server-side wait (+%dms)',
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
				if (!(err instanceof DOMException && err.name === 'AbortError')) {
					logger?.debug(
						'[run] sandboxGetStatus server-side wait failed (+%dms): %s',
						Date.now() - statusPollStart,
						err
					);
				}
			}
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
	}
}

async function waitForExecutionCompletion(
	client: APIClient,
	executionId: string,
	orgId: string | undefined,
	signal: AbortSignal | undefined,
	logger: Logger | undefined,
	started: number
): Promise<{ exitCode?: number; status: string }> {
	while (true) {
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		const result = await executionGet(client, {
			executionId,
			orgId,
			wait: EXECUTION_WAIT_DURATION,
			signal,
		});
		logger?.debug(
			'[run] execution wait: id=%s status=%s exit=%s +%dms',
			executionId,
			result.status,
			result.exitCode ?? 'undefined',
			Date.now() - started
		);

		if (TERMINAL_EXECUTION_STATUSES.has(result.status)) {
			return {
				exitCode: result.exitCode,
				status: result.status,
			};
		}
	}
}

async function waitForStreamsToDrain(
	streamPromises: Promise<void>[],
	signal: AbortSignal | undefined,
	abortController: AbortController,
	sandboxId: string
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

async function raceWithAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal,
	abortController: AbortController,
	sandboxId: string
): Promise<T> {
	let onAbort: (() => void) | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				onAbort = () => {
					abortController.abort();
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
						controller.close();
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
		// Signal to Pulse that this is a v2 stream so it waits for v2 metadata
		// instead of falling back to the legacy download path on a short timeout.
		const v2Url = new URL(url);
		v2Url.searchParams.set('v', '2');
		logger?.debug('[stream] fetching: %s', v2Url.href);
		const response = await fetch(v2Url.href, { signal });
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
