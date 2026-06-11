/**
 * Sandbox Route - Execute demo scripts in cloud sandboxes with streaming output.
 *
 * Flow: Browser → this route → cloud sandbox → streamed output back
 *
 * Interactive sessions: The first request from a browser session creates a
 * long-lived sandbox (10 min idle timeout). Subsequent requests reuse it via
 * KV-stored sandboxId keyed by the thread ID (from ctx.thread.id). If the interactive
 * path fails for any reason, falls back to one-shot `sandboxRun()`.
 *
 * Usage: GET /run?script=<name>&input=<base64JSON>
 */
import { sse } from '../http';
import type { ApiEnv } from '../context';
import { StructuredError } from '@agentuity/core';
import {
	APIClient,
	sandboxRun,
	sandboxCreate,
	sandboxExecute,
	executionGet,
	getServiceUrls,
	SandboxNotFoundError,
	SandboxTerminatedError,
	type ExecutionStatus,
	type FileToWrite,
} from '@agentuity/server';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { SCRIPT_NAMES, SCRIPT_DEFAULTS } from './scripts';
import {
	createSandboxOutputForwarder,
	type SandboxOutputForwarder,
	type SSEStream,
} from './output-forwarder';
import { extractOutputPayload } from '../../lib/sandbox-output-protocol';
import { Hono } from 'hono';

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;
const SANDBOX_EXEC_TIMEOUT = '2m';
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

const SESSION_BUCKET = 'explorer-sessions';
const SESSION_TTL = 600; // 10 min, matches sandbox idle timeout
const SANDBOX_IDLE_TIMEOUT = '10m';
const SSE_HEARTBEAT_INTERVAL_MS = 5_000;
// Completion detection (interactive path)
const MAX_EXECUTION_POLLS = 6;
// Grace period after completion for live streams to flush trailing chunks
// before we abort them (safety net for streams that don't EOF on exec end).
const STREAM_FLUSH_GRACE_MS = 800;
const SANDBOX_SERVICE_SCOPES = [
	'services:read',
	'services:write',
	'schedule:read',
	'schedule:write',
];
// Terminal execution statuses — typed against the SDK enum so drift is caught at compile time
const TERMINAL_STATUSES = new Set<ExecutionStatus>(['completed', 'failed', 'timeout', 'cancelled']);
const SandboxScriptFileMissingError = StructuredError('SandboxScriptFileMissingError')<{
	scriptPath: string;
	cwd: string;
}>();

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function loadScriptFiles(scriptPath: string): Promise<FileToWrite[]> {
	const file = Bun.file(resolve(process.cwd(), scriptPath));
	if (!(await file.exists())) {
		throw new SandboxScriptFileMissingError({
			message: `Bundled demo script not found: ${scriptPath}. Run \`bun run build:run\` before using sandbox demos.`,
			scriptPath,
			cwd: process.cwd(),
		});
	}

	return [
		{
			path: scriptPath,
			content: new Uint8Array(await file.arrayBuffer()),
		},
	];
}

interface SandboxExecutionResult {
	readonly exitCode: number;
	readonly error?: string;
}

async function sendExecutionResult(
	stream: SSEStream,
	result: SandboxExecutionResult
): Promise<void> {
	if (result.error) {
		await stream.writeSSE({ event: 'error', data: result.error });
		return;
	}

	await stream.writeSSE({
		event: 'done',
		data: JSON.stringify({ exitCode: result.exitCode, status: 'completed' }),
	});
}

/**
 * Read a Pulse stream URL incrementally and forward protocol-framed chunks via
 * the given forwarder. The `?v=2` query tells Pulse to hold the connection open and
 * push chunks live instead of the legacy buffered-download path. Resolves on
 * stream EOF (command finished) or when the signal aborts.
 */
async function streamOutputToSSE(
	url: string,
	forwarder: SandboxOutputForwarder,
	signal?: AbortSignal
): Promise<void> {
	const v2Url = new URL(url);
	v2Url.searchParams.set('v', '2');

	let response: Response;
	try {
		response = await fetch(v2Url.href, signal ? { signal } : {});
	} catch {
		return;
	}
	if (!response.ok || !response.body) return;

	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8');
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) forwarder.push(decoder.decode(value, { stream: true }));
		}
		// Flush any bytes the decoder buffered from a multibyte char split at EOF.
		const tail = decoder.decode();
		if (tail) forwarder.push(tail);
	} catch {
		// Aborted after completion, or a transient network error — stop reading.
	} finally {
		try {
			await reader.cancel();
		} catch {
			// already closed
		}
	}
}

async function withHeartbeat<T>(
	stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
	operation: () => Promise<T>
): Promise<T> {
	const interval = setInterval(() => {
		void stream.writeSSE({ event: 'heartbeat', data: String(Date.now()) }).catch(() => {});
	}, SSE_HEARTBEAT_INTERVAL_MS);

	try {
		return await operation();
	} finally {
		clearInterval(interval);
	}
}

const router = new Hono<ApiEnv>().get(
	'/run',
	sse(async (c, stream) => {
		// Validate config
		if (!SNAPSHOT_ID) {
			await stream.writeSSE({ event: 'error', data: 'SANDBOX_SNAPSHOT_ID not configured.' });
			return;
		}

		// Validate script name
		const scriptName = c.req.query('script');
		if (!scriptName || !SCRIPT_NAMES.has(scriptName)) {
			await stream.writeSSE({
				event: 'error',
				data: `Unknown script: ${scriptName}. Available: ${[...SCRIPT_NAMES].join(', ')}`,
			});
			return;
		}

		// Parse input
		const inputBase64 = c.req.query('input');
		let input: unknown;
		if (inputBase64) {
			try {
				input = JSON.parse(Buffer.from(inputBase64, 'base64').toString('utf-8'));
			} catch {
				await stream.writeSSE({ event: 'error', data: 'Invalid input parameter' });
				return;
			}
		} else {
			input = SCRIPT_DEFAULTS[scriptName];
		}

		const logger = c.var.logger;
		const apiKey = process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY || '';
		if (!apiKey) {
			await stream.writeSSE({
				event: 'error',
				data: 'AGENTUITY_SDK_KEY or AGENTUITY_CLI_KEY not configured.',
			});
			return;
		}
		const region = process.env.AGENTUITY_REGION ?? 'usc';
		const orgId =
			process.env.AGENTUITY_ORG_ID ??
			process.env.AGENTUITY_ORGID ??
			process.env.AGENTUITY_CLOUD_ORG_ID;

		const serviceUrls = getServiceUrls(region);
		const client = new APIClient(serviceUrls.sandbox, logger, apiKey);

		// Build env vars for sandbox
		const envVars: Record<string, string> = {
			AGENTUITY_SDK_KEY: apiKey,
			AGENTUITY_REGION: region,
			OPENAI_API_KEY: apiKey,
			OPENAI_BASE_URL: `${AI_GATEWAY_URL}/openai`,
			ANTHROPIC_API_KEY: apiKey,
			ANTHROPIC_BASE_URL: `${AI_GATEWAY_URL}/anthropic`,
			GROQ_API_KEY: apiKey,
			GROQ_BASE_URL: `${AI_GATEWAY_URL}/groq`,
		};

		if (orgId) envVars.AGENTUITY_ORG_ID = orgId;

		if (process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID)
			envVars.AGENTUITY_CLOUD_DEPLOYMENT_ID = process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
		if (process.env.DATABASE_URL) envVars.DATABASE_URL = process.env.DATABASE_URL;

		const storageEnv = {
			AWS_BUCKET: process.env.AWS_BUCKET ?? process.env.S3_BUCKET,
			AWS_ENDPOINT: process.env.AWS_ENDPOINT ?? process.env.S3_ENDPOINT,
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID,
			AWS_SECRET_ACCESS_KEY:
				process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY,
			AWS_REGION: process.env.AWS_REGION ?? process.env.S3_REGION,
			S3_BUCKET: process.env.S3_BUCKET,
			S3_ENDPOINT: process.env.S3_ENDPOINT,
			S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
			S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
			S3_REGION: process.env.S3_REGION,
		};
		for (const [key, value] of Object.entries(storageEnv)) {
			if (value) envVars[key] = value;
		}

		const scriptPath = `dist/run/${scriptName}.js`;
		const command = ['bun', 'run', scriptPath, JSON.stringify(input)];
		let scriptFiles: FileToWrite[];
		try {
			scriptFiles = await loadScriptFiles(scriptPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown sandbox setup error';
			logger?.error('Sandbox setup error', { error: message });
			await stream.writeSSE({ event: 'error', data: message });
			return;
		}
		// Sandbox env is fixed at creation, so a reused session sandbox can predate
		// the linked-bucket AWS_* env (e.g. storage linked after the session began).
		// Always run the object storage script one-shot so it sees current env.
		const useInteractiveSandbox = scriptName !== 'objectstore';

		// --- Interactive session path ---
		try {
			const threadId = c.var.thread?.id;

			if (threadId && useInteractiveSandbox) {
				const kvResult = await c.var.kv.get<string>(SESSION_BUCKET, threadId);

				let sandboxId: string;

				if (kvResult.exists) {
					sandboxId = kvResult.data;
					logger?.info('Reusing sandbox', { sandboxId, threadId, script: scriptName });

					try {
						await stream.writeSSE({ event: 'status', data: 'running' });
						const result = await withHeartbeat(stream, () =>
							executeOnSandbox(client, sandboxId, command, scriptFiles, orgId, stream)
						);
						await c.var.kv.set(SESSION_BUCKET, threadId, sandboxId, { ttl: SESSION_TTL });
						await sendExecutionResult(stream, result);
						return;
					} catch (err) {
						if (
							err instanceof SandboxNotFoundError ||
							err instanceof SandboxTerminatedError
						) {
							logger?.info('Sandbox expired, creating new one', { sandboxId, threadId });
							// Fall through to create new sandbox
						} else {
							throw err;
						}
					}
				}

				// Create new interactive sandbox
				await stream.writeSSE({ event: 'status', data: 'creating' });

				const createResponse = await sandboxCreate(client, {
					options: {
						snapshot: SNAPSHOT_ID,
						network: { enabled: true },
						timeout: { idle: SANDBOX_IDLE_TIMEOUT },
						env: envVars,
						scopes: SANDBOX_SERVICE_SCOPES,
					},
					orgId,
				});

				sandboxId = createResponse.sandboxId;
				logger?.info('Created interactive sandbox', { sandboxId, threadId });

				await c.var.kv.set(SESSION_BUCKET, threadId, sandboxId, { ttl: SESSION_TTL });

				await stream.writeSSE({ event: 'status', data: 'running' });
				const result = await withHeartbeat(stream, () =>
					executeOnSandbox(client, sandboxId, command, scriptFiles, orgId, stream)
				);
				await sendExecutionResult(stream, result);
				return;
			}
		} catch (err) {
			logger?.debug('Interactive path failed, falling back to one-shot', {
				error: err instanceof Error ? err.message : String(err),
			});
		}

		// --- One-shot fallback ---
		await stream.writeSSE({ event: 'status', data: 'creating' });

		let detectedExitCode: number | null = null;
		const oneShotChunks: string[] = [];
		const oneShotForwarder = createSandboxOutputForwarder(stream);
		const sseWritable = new Writable({
			write(chunk, _encoding, callback) {
				const raw = chunk.toString();
				oneShotChunks.push(raw);

				const exitMatch = raw.match(/process exited with error: exit status (\d+)/);
				if (exitMatch) {
					detectedExitCode = parseInt(exitMatch[1], 10);
				}

				// Forward protocol-framed chunks live as they arrive from sandboxRun's
				// internal Pulse stream reader, instead of buffering until the end.
				oneShotForwarder.push(raw);
				callback();
			},
		});

		try {
			logger?.info('Running sandbox script (one-shot)', { script: scriptName });
			await stream.writeSSE({ event: 'status', data: 'running' });

			const result = await withHeartbeat(stream, () =>
				sandboxRun(client, {
					options: {
						snapshot: SNAPSHOT_ID,
						command: { exec: command, files: scriptFiles },
						network: { enabled: true },
						timeout: { execution: SANDBOX_EXEC_TIMEOUT },
						env: envVars,
						scopes: SANDBOX_SERVICE_SCOPES,
					},
					orgId,
					region,
					apiKey,
					stdout: sseWritable,
					stderr: sseWritable,
					logger,
				})
			);

			await oneShotForwarder.flush();

			const exitCode = detectedExitCode ?? result.exitCode;
			if (!oneShotForwarder.hasOutput()) {
				const buffered = extractOutputPayload(oneShotChunks.join(''), {
					allowUnmarkedFallback: exitCode !== 0,
				});
				if (buffered) {
					await stream.writeSSE({ event: 'stdout', data: buffered.replace(/\n/g, '\\n') });
				}
			}

			logger?.info('Sandbox completed', {
				script: scriptName,
				sandboxId: result.sandboxId,
				exitCode,
			});

			await stream.writeSSE({
				event: 'done',
				data: JSON.stringify({ exitCode, status: 'completed' }),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger?.error('Sandbox error', { error: message });
			await stream.writeSSE({ event: 'error', data: message });
		}
	})
);

/**
 * Execute a command on an existing sandbox and return the output.
 * Polls executionGet until the execution reaches a terminal status before
 * fetching output streams, so we don't read partial data.
 */
async function executeOnSandbox(
	client: APIClient,
	sandboxId: string,
	command: string[],
	files: FileToWrite[],
	orgId: string | undefined,
	sseStream: SSEStream
): Promise<SandboxExecutionResult> {
	const execution = await sandboxExecute(client, {
		sandboxId,
		options: { command, files, timeout: SANDBOX_EXEC_TIMEOUT },
		orgId,
	});

	// Stream the stdout URL (available immediately from the execute response) live
	// WHILE the command runs. Only protocol-framed stdout is forwarded; logger
	// noise is ignored. An uncaught crash with no protocol output is surfaced by
	// the post-completion safety net below.
	const stdoutUrl = execution.stdoutStreamUrl;
	const forwarder = createSandboxOutputForwarder(sseStream);
	const abort = new AbortController();
	const streamPromise = stdoutUrl
		? streamOutputToSSE(stdoutUrl, forwarder, abort.signal)
		: Promise.resolve();

	try {
		// Wait for the execution to finish. executionGet long-polls server-side and
		// returns as soon as the execution is terminal, so fast runs return fast.
		// We do NOT race sandboxGetStatus here: on the interactive path the sandbox
		// is reused and stays alive after each execution, so its status never
		// reaches 'terminated' on normal completion. (The one-shot path gets that
		// race for free inside sandboxRun.)
		let result = await executionGet(client, {
			executionId: execution.executionId,
			orgId,
			wait: '5m',
		});
		let pollIterations = 0;
		while (!TERMINAL_STATUSES.has(result.status)) {
			if (++pollIterations > MAX_EXECUTION_POLLS) {
				throw new Error(
					`Execution ${execution.executionId} did not complete after ${MAX_EXECUTION_POLLS} poll attempts`
				);
			}
			result = await executionGet(client, {
				executionId: execution.executionId,
				orgId,
				wait: '5m',
			});
		}

		// Let the live stream flush trailing chunks, then stop it. Per-execution
		// streams normally EOF when the command exits; the grace + abort is a safety
		// net so a stream that stays open for the sandbox lifetime cannot hang us.
		await Promise.race([streamPromise, delay(STREAM_FLUSH_GRACE_MS)]);
		abort.abort();
		await streamPromise;
		await forwarder.flush();

		const exitCode = result.exitCode ?? (result.status === 'completed' ? 0 : 1);

		// Safety net: if the live stream produced no protocol output (stream URL not ready, or
		// an uncaught crash with no protocol stdout), fetch the now-complete stdout +
		// stderr once so the user still sees output or the error trace.
		if (!forwarder.hasOutput()) {
			const stderrUrl = execution.stderrStreamUrl;
			const isCombined = !!stdoutUrl && !!stderrUrl && stdoutUrl === stderrUrl;
			const [out, err] = await Promise.all([
				fetchOutput(stdoutUrl),
				isCombined ? Promise.resolve('') : fetchOutput(stderrUrl),
			]);
			const buffered = extractOutputPayload([out, err].filter(Boolean).join('\n'), {
				allowUnmarkedFallback: exitCode !== 0,
			});
			if (buffered) {
				await sseStream.writeSSE({ event: 'stdout', data: buffered.replace(/\n/g, '\\n') });
			}
		}

		return { exitCode };
	} catch (err) {
		// Always stop the live stream.
		abort.abort();
		await streamPromise.catch(() => {});
		await forwarder.flush();
		// If protocol output already started, do NOT rethrow: the caller would fall
		// back to a one-shot re-run and duplicate side effects. Report the failure
		// on the existing SSE stream instead.
		if (forwarder.hasOutput()) {
			const message = err instanceof Error ? err.message : 'Sandbox execution failed';
			return {
				exitCode: 1,
				error: `Sandbox execution failed after output started: ${message}`,
			};
		}
		throw err;
	}
}

/**
 * Fetch output from a stream URL. Returns empty string on error.
 * Used only by the executeOnSandbox safety-net fallback.
 */
async function fetchOutput(url: string | undefined): Promise<string> {
	if (!url) return '';
	try {
		const response = await fetch(url);
		return response.ok ? await response.text() : '';
	} catch {
		return '';
	}
}

export default router;
