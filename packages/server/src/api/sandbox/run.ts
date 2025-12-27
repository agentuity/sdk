import type { Logger } from '@agentuity/core';
import type { Readable, Writable } from 'node:stream';
import { APIClient } from '../api';
import { sandboxCreate } from './create';
import { sandboxDestroy } from './destroy';
import { sandboxGet } from './get';
import { SandboxResponseError } from './util';
import type { SandboxRunOptions, SandboxRunResult } from '@agentuity/core';
import { getServiceUrls } from '../../config';

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 7200;

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

	const abortController = new AbortController();
	const streamPromises: Promise<void>[] = [];

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
			if (stdout) {
				logger?.debug('using combined output stream (stdout === stderr)');
				const combinedPromise = streamUrlToWritable(
					stdoutStreamUrl,
					stdout,
					abortController.signal,
					logger
				);
				streamPromises.push(combinedPromise);
			}
		} else {
			// Start stdout streaming
			if (stdoutStreamUrl && stdout) {
				const stdoutPromise = streamUrlToWritable(
					stdoutStreamUrl,
					stdout,
					abortController.signal,
					logger
				);
				streamPromises.push(stdoutPromise);
			}

			// Start stderr streaming
			if (stderrStreamUrl && stderr) {
				const stderrPromise = streamUrlToWritable(
					stderrStreamUrl,
					stderr,
					abortController.signal,
					logger
				);
				streamPromises.push(stderrPromise);
			}
		}

		let attempts = 0;
		while (attempts < MAX_POLL_ATTEMPTS) {
			if (signal?.aborted) {
				throw new SandboxResponseError({
					message: 'Sandbox execution cancelled',
					sandboxId,
				});
			}

			await sleep(POLL_INTERVAL_MS);
			attempts++;

			try {
				const sandboxInfo = await sandboxGet(client, { sandboxId, orgId });

				if (sandboxInfo.status === 'terminated') {
					return {
						sandboxId,
						exitCode: 0,
						durationMs: Date.now() - started,
					};
				}

				if (sandboxInfo.status === 'failed') {
					return {
						sandboxId,
						exitCode: 1,
						durationMs: Date.now() - started,
					};
				}
			} catch {
				continue;
			}
		}

		throw new SandboxResponseError({
			message: 'Sandbox execution polling timed out',
			sandboxId,
		});
	} catch (error) {
		try {
			await sandboxDestroy(client, { sandboxId, orgId });
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	} finally {
		// Give streams time to flush before aborting
		await sleep(100);
		abortController.abort();
		// Wait for all stream promises to settle
		await Promise.allSettled(streamPromises);
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
	logger?: Logger
): Promise<void> {
	try {
		logger?.debug('fetching stream: %s', url);
		const response = await fetch(url, { signal });
		logger?.debug('stream response status: %d', response.status);

		if (!response.ok || !response.body) {
			logger?.debug('stream response not ok or no body');
			return;
		}

		const reader = response.body.getReader();

		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				logger?.debug('stream done');
				break;
			}

			if (value) {
				logger?.debug('stream chunk: %d bytes', value.length);
				writable.write(value);
			}
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			logger?.debug('stream aborted (expected on completion)');
		} else {
			logger?.debug('stream caught error: %s', err);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
