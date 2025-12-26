import type { Logger } from '@agentuity/core';
import { APIClient } from '../api';
import { sandboxCreate } from './create';
import { sandboxDestroy } from './destroy';
import { sandboxGet } from './get';
import { SandboxResponseError } from './util';
import type { SandboxRunOptions, SandboxRunResult } from '@agentuity/core';

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 7200;

export interface SandboxRunParams {
	options: SandboxRunOptions;
	orgId?: string;
	signal?: AbortSignal;
	onOutput?: (chunk: string) => void;
	logger?: Logger;
}

export async function sandboxRun(
	client: APIClient,
	params: SandboxRunParams
): Promise<SandboxRunResult> {
	const { options, orgId, signal, onOutput, logger } = params;
	const started = Date.now();

	const createResponse = await sandboxCreate(client, {
		options: {
			...options,
			command: {
				exec: options.command.exec,
				files: options.command.files,
				mode: 'oneshot',
			},
		},
		orgId,
	});

	const sandboxId = createResponse.sandboxId;
	const streamUrl = createResponse.stdoutStreamUrl;

	logger?.debug('sandbox created: %s, streamUrl: %s', sandboxId, streamUrl ?? 'none');

	let streamAbortController: AbortController | undefined;

	try {
		if (streamUrl && onOutput) {
			streamAbortController = new AbortController();
			logger?.debug('starting stream from: %s', streamUrl);
			streamOutput(streamUrl, onOutput, streamAbortController.signal, logger).catch((err) => {
				logger?.debug('stream error: %s', err);
			});
		} else {
			logger?.debug('no stream URL or onOutput callback');
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
		streamAbortController?.abort();
	}
}

async function streamOutput(
	url: string,
	onOutput: (chunk: string) => void,
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
		const decoder = new TextDecoder();

		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				logger?.debug('stream done');
				break;
			}

			const text = decoder.decode(value, { stream: true });
			if (text) {
				logger?.debug('stream chunk: %d bytes', text.length);
				onOutput(text);
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
