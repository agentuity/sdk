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
import { sse, createAgentContext, type Env } from '@agentuity/runtime';
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
} from '@agentuity/server';
import { Writable } from 'node:stream';
import { SCRIPT_NAMES, SCRIPT_DEFAULTS } from './scripts';
import { Hono } from 'hono';

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;
const SANDBOX_EXEC_TIMEOUT = '2m';
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

const SESSION_BUCKET = 'explorer-sessions';
const SESSION_TTL = 600; // 10 min, matches sandbox idle timeout
const SANDBOX_IDLE_TIMEOUT = '10m';
const SSE_HEARTBEAT_INTERVAL_MS = 5_000;

// Terminal execution statuses — typed against the SDK enum so drift is caught at compile time
const TERMINAL_STATUSES = new Set<ExecutionStatus>(['completed', 'failed', 'timeout', 'cancelled']);

// ANSI escape sequence regex for stripping terminal colors
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

function cleanOutput(content: string): string {
	return content
		.replace(ANSI_ESCAPE_REGEX, '')
		.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z[ \t]*/gm, '')
		.replace(/\\"/g, '"')
		.replace(/\\n/g, '\n');
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

const router = new Hono<Env>().get(
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
		const orgId = process.env.AGENTUITY_ORG_ID;

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
			GOOGLE_API_KEY: apiKey,
			GOOGLE_GENERATIVE_AI_BASE_URL: `${AI_GATEWAY_URL}/google`,
			GROQ_API_KEY: apiKey,
			GROQ_BASE_URL: `${AI_GATEWAY_URL}/groq`,
		};

		if (process.env.DATABASE_URL) envVars.DATABASE_URL = process.env.DATABASE_URL;
		if (process.env.S3_BUCKET) envVars.S3_BUCKET = process.env.S3_BUCKET;
		if (process.env.S3_ENDPOINT) envVars.S3_ENDPOINT = process.env.S3_ENDPOINT;
		if (process.env.S3_ACCESS_KEY_ID) envVars.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
		if (process.env.S3_SECRET_ACCESS_KEY)
			envVars.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

		const scriptPath = `dist/run/${scriptName}.js`;
		const command = ['bun', 'run', scriptPath, JSON.stringify(input)];

		// --- Interactive session path ---
		try {
			const threadId = c.var.thread?.id;

			if (threadId) {
				const ctx = createAgentContext();
				const kvResult = await ctx.kv.get<string>(SESSION_BUCKET, threadId);

				let sandboxId: string;

				if (kvResult.exists) {
					sandboxId = kvResult.data;
					logger?.info('Reusing sandbox', { sandboxId, threadId, script: scriptName });

					try {
						await stream.writeSSE({ event: 'status', data: 'running' });
						const output = await withHeartbeat(stream, () =>
							executeOnSandbox(client, sandboxId, command, orgId)
						);
						await ctx.kv.set(SESSION_BUCKET, threadId, sandboxId, { ttl: SESSION_TTL });
						await sendOutput(stream, output);
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
					},
					orgId,
				});

				sandboxId = createResponse.sandboxId;
				logger?.info('Created interactive sandbox', { sandboxId, threadId });

				await ctx.kv.set(SESSION_BUCKET, threadId, sandboxId, { ttl: SESSION_TTL });

				await stream.writeSSE({ event: 'status', data: 'running' });
				const output = await withHeartbeat(stream, () =>
					executeOnSandbox(client, sandboxId, command, orgId)
				);
				await sendOutput(stream, output);
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
		const sseWritable = new Writable({
			write(chunk, _encoding, callback) {
				const raw = chunk.toString();
				const text = cleanOutput(raw);

				const exitMatch = raw.match(/process exited with error: exit status (\d+)/);
				if (exitMatch) {
					detectedExitCode = parseInt(exitMatch[1], 10);
				}

				if (text.length > 0) {
					const encoded = text.replace(/\n/g, '\\n');
					stream.writeSSE({ event: 'stdout', data: encoded }).then(() => callback(), callback);
				} else {
					callback();
				}
			},
		});

		try {
			logger?.info('Running sandbox script (one-shot)', { script: scriptName });
			await stream.writeSSE({ event: 'status', data: 'running' });

			const result = await withHeartbeat(stream, () =>
				sandboxRun(client, {
					options: {
						snapshot: SNAPSHOT_ID,
						command: { exec: command },
						network: { enabled: true },
						timeout: { execution: SANDBOX_EXEC_TIMEOUT },
						env: envVars,
					},
					orgId,
					region,
					apiKey,
					stdout: sseWritable,
					stderr: sseWritable,
					logger,
				})
			);

			const exitCode = detectedExitCode ?? result.exitCode;
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
	orgId: string | undefined
): Promise<{ output: string; exitCode: number }> {
	const execution = await sandboxExecute(client, {
		sandboxId,
		options: { command, timeout: SANDBOX_EXEC_TIMEOUT },
		orgId,
	});

	// Poll until execution reaches a terminal state.
	// executionGet with `wait` uses server-side long-polling, but may return
	// a non-terminal status if the wait duration expires before completion.
	let result = await executionGet(client, {
		executionId: execution.executionId,
		orgId,
		wait: '5m',
	});

	// Guard against stuck-queued executions that never start
	const MAX_POLL_ITERATIONS = 6;
	let pollIterations = 0;

	while (!TERMINAL_STATUSES.has(result.status)) {
		if (++pollIterations > MAX_POLL_ITERATIONS) {
			throw new Error(
				`Execution ${execution.executionId} did not complete after ${MAX_POLL_ITERATIONS} poll attempts`
			);
		}
		result = await executionGet(client, {
			executionId: execution.executionId,
			orgId,
			wait: '5m',
		});
	}

	// Fetch output after completion (prefer URLs from result, fall back to execution)
	const stdoutUrl = result.stdoutStreamUrl ?? execution.stdoutStreamUrl;
	const stderrUrl = result.stderrStreamUrl ?? execution.stderrStreamUrl;

	// If stdout and stderr are the same stream, fetch once to avoid duplicates
	const isCombined = stdoutUrl && stderrUrl && stdoutUrl === stderrUrl;
	const [stdout, stderr] = isCombined
		? [await fetchOutput(stdoutUrl), '']
		: await Promise.all([fetchOutput(stdoutUrl), fetchOutput(stderrUrl)]);

	const output = [stdout, stderr].filter(Boolean).join('\n');

	return { output, exitCode: result.exitCode ?? (result.status === 'completed' ? 0 : 1) };
}

/**
 * Fetch output from a stream URL. Returns empty string on error.
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

/**
 * Send output to SSE stream.
 */
async function sendOutput(
	stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
	result: { output: string; exitCode: number }
): Promise<void> {
	if (result.output) {
		const cleaned = cleanOutput(result.output);
		if (cleaned) {
			const encoded = cleaned.replace(/\n/g, '\\n');
			await stream.writeSSE({ event: 'stdout', data: encoded });
		}
	}

	await stream.writeSSE({
		event: 'done',
		data: JSON.stringify({ exitCode: result.exitCode, status: 'completed' }),
	});
}

export default router;
