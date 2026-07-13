import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { APIClient, createMinimalLogger } from '@agentuity/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase } from '../../../../src/cache/index.ts';
import { execSubcommand } from '../../../../src/cmd/cloud/sandbox/exec.ts';
import type { CommandContext } from '../../../../src/types.ts';

// Anchored to the moment the execution result is served, so the stream's EOF
// always lands well past the old 500ms post-completion grace window that the
// drain fix removed, regardless of scheduling skew before completion.
const STREAM_DELAY_AFTER_EXECUTION_MS = 1200;
const STREAM_OUTPUT = 'delayed output\n';
const ORIGINAL_STDOUT_WRITE = process.stdout.write;
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CONFIG_DIR = process.env.AGENTUITY_CONFIG_DIR;

let configDir: string;

beforeAll(async () => {
	configDir = await mkdtemp(join(tmpdir(), 'sandbox-exec-command-test-'));
	process.env.AGENTUITY_CONFIG_DIR = configDir;
});

afterEach(() => {
	process.stdout.write = ORIGINAL_STDOUT_WRITE;
	globalThis.fetch = ORIGINAL_FETCH;
});

afterAll(async () => {
	closeDatabase();
	if (ORIGINAL_CONFIG_DIR === undefined) {
		delete process.env.AGENTUITY_CONFIG_DIR;
	} else {
		process.env.AGENTUITY_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
	}
	await rm(configDir, { recursive: true, force: true });
});

function delayedStream(
	signal: AbortSignal,
	executionServed: Promise<void>
): ReadableStream<Uint8Array> {
	let cancelled = false;
	let delivered = false;

	return new ReadableStream({
		start(controller) {
			const abort = () => {
				cancelled = true;
				controller.error(new DOMException('The operation was aborted', 'AbortError'));
			};
			if (signal.aborted) {
				abort();
			} else {
				signal.addEventListener('abort', abort, { once: true });
			}
		},
		async pull(controller) {
			if (delivered) {
				return;
			}
			delivered = true;
			await executionServed;
			await new Promise((resolve) => setTimeout(resolve, STREAM_DELAY_AFTER_EXECUTION_MS));
			if (!cancelled) {
				controller.enqueue(new TextEncoder().encode(STREAM_OUTPUT));
				controller.close();
			}
		},
		cancel() {
			cancelled = true;
		},
	});
}

function installFetchFake(): void {
	// Definite assignment: a Promise executor runs synchronously.
	let resolveExecutionServed!: () => void;
	const executionServed = new Promise<void>((resolve) => {
		resolveExecutionServed = resolve;
	});
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/cli/sandbox/sbx_test') {
			return Response.json({
				success: true,
				data: {
					id: 'sbx_test',
					name: 'test',
					region: 'local',
					status: 'idle',
					orgId: 'org_test',
					projectId: null,
				},
			});
		}

		if (request.method === 'POST' && url.pathname === '/sandbox/sbx_test/execute') {
			return Response.json({
				success: true,
				data: {
					executionId: 'exec_test',
					status: 'running',
					stdoutStreamUrl: 'https://pulse.test/stdout',
				},
			});
		}

		if (request.method === 'GET' && url.pathname === '/sandbox/execution/exec_test') {
			resolveExecutionServed();
			return Response.json({
				success: true,
				data: {
					executionId: 'exec_test',
					sandboxId: 'sbx_test',
					status: 'completed',
					exitCode: 0,
					durationMs: 10,
				},
			});
		}

		if (request.method === 'GET' && url.hostname === 'pulse.test') {
			return new Response(delayedStream(request.signal, executionServed));
		}

		return Response.json({ success: false, message: 'unexpected request' }, { status: 404 });
	}) as typeof fetch;
}

function makeContext(json: boolean, catalystUrl: string): CommandContext {
	const logger = createMinimalLogger();
	const context = {
		args: { sandboxId: 'sbx_test', command: ['echo', 'hello'] },
		opts: { timestamps: false, quiet: false },
		options: { json, quiet: false, logLevel: 'error' },
		auth: {
			apiKey: 'ag_test',
			userId: 'usr_test',
			expires: new Date(Date.now() + 60_000),
		},
		apiClient: new APIClient(catalystUrl, logger, 'ag_test'),
		config: { name: `exec-test-${json ? 'json' : 'plain'}`, preferences: {} },
		logger,
		getExecutingAgent: () => undefined,
	};

	return context as unknown as CommandContext;
}

async function runExec(json: boolean): Promise<unknown> {
	installFetchFake();
	const catalystUrl = 'https://catalyst.test';

	const handler = execSubcommand.handler;
	if (!handler) {
		throw new Error('sandbox exec handler is missing');
	}
	return handler(makeContext(json, catalystUrl));
}

describe('cloud sandbox exec command', () => {
	test('drains delayed stdout after execution completes in plain mode', async () => {
		let stdout = '';
		process.stdout.write = ((chunk: string | Uint8Array) => {
			stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
			return true;
		}) as typeof process.stdout.write;

		await runExec(false);

		expect(stdout).toContain(STREAM_OUTPUT);
	});

	test('drains delayed stdout after execution completes in JSON mode', async () => {
		const result = await runExec(true);

		expect(result).toMatchObject({
			stdout: STREAM_OUTPUT,
			output: STREAM_OUTPUT,
		});
	});
});
