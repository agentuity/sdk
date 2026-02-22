import type { Logger } from '@agentuity/core';
import type { Readable, Writable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { APIClient, PaymentRequiredError } from '../api.ts';
import { sandboxCreate } from './create.ts';
import { sandboxDestroy } from './destroy.ts';
import { sandboxGetStatus } from './getStatus.ts';
import { ExecutionCancelledError, writeAndDrain } from './util.ts';
import type { SandboxRunOptions, SandboxRunResult } from '@agentuity/core';
import { getServiceUrls } from '../../config.ts';

const timingLogsEnabled = false;

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
			tee.pipe(userStream);
		}
	}

	return tee;
}

export interface SandboxRunParams {
	options: SandboxRunOptions;
	orgId?: string;
	region?: string;
	apiKey?: string;
	signal?: AbortSignal;
	stdin?: Readable;
	stdout?: Writable;
	stderr?: Writable;
	logger?: Logger;
}

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

	// If stdin is provided and has data, create a stream for it
	if (stdin && region && apiKey) {
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

		// Wait for streams to complete — Pulse closes streams on sandbox termination (EOF).
		// This is our primary completion signal; no polling needed.
		logger?.debug('waiting for streams to complete...');

		if (streamPromises.length > 0) {
			if (signal) {
				// Race streams against abort signal
				await Promise.race([
					Promise.allSettled(streamPromises),
					new Promise<never>((_, reject) => {
						const onAbort = () => {
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
			} else {
				await Promise.allSettled(streamPromises);
			}
		} else {
			// No streams available (shouldn't happen for oneshot, but handle defensively).
			// Fall back to a single wait then check.
			logger?.debug('no streams to wait on, checking sandbox status directly');
		}

		if (timingLogsEnabled)
			console.error(`[TIMING] +${Date.now() - started}ms: all streams done, fetching exit code`);
		logger?.debug('streams completed, fetching final status');

		// Stream EOF means the sandbox is done — hadron only closes streams after the
		// container exits. Fetch status once for the exit code; if lifecycle events
		// haven't propagated to Catalyst yet, default to exit code 0.
		let exitCode = 0;
		try {
			const sandboxStatus = await sandboxGetStatus(client, { sandboxId, orgId });
			if (sandboxStatus.exitCode != null) {
				exitCode = sandboxStatus.exitCode;
			} else if (sandboxStatus.status === 'failed') {
				exitCode = 1;
			}
		} catch {
			// Sandbox may already be destroyed (fire-and-forget teardown).
			// Stream EOF already confirmed execution completed.
			logger?.debug('sandboxGetStatus failed after stream EOF, using default exit code 0');
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
	started?: number
): Promise<void> {
	try {
		logger?.debug('fetching stream: %s', url);
		const response = await fetch(url, { signal });
		logger?.debug('stream response status: %d', response.status);
		if (timingLogsEnabled && started)
			console.error(
				`[TIMING] +${Date.now() - started}ms: stream response received (status: ${response.status})`
			);

		if (!response.ok || !response.body) {
			logger?.debug('stream response not ok or no body');
			return;
		}

		const reader = response.body.getReader();
		let firstChunk = true;

		// Read until EOF - Pulse will block until data is available
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				logger?.debug('stream EOF');
				if (timingLogsEnabled && started)
					console.error(`[TIMING] +${Date.now() - started}ms: stream EOF`);
				break;
			}

			if (value) {
				if (firstChunk && started) {
					if (timingLogsEnabled)
						console.error(
							`[TIMING] +${Date.now() - started}ms: first chunk (${value.length} bytes)`
						);
					firstChunk = false;
				}
				logger?.debug('stream chunk: %d bytes', value.length);
				await writeAndDrain(writable, value);
			}
		}
		// Signal end-of-stream to the tee/pipe chain so downstream
		// consumers (e.g. process.stdout pipe) know no more data is coming.
		writable.end();
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger?.debug('stream aborted');
			return;
		}
		logger?.debug('stream error: %s', err);
	}
}
