/**
 * Sandbox Route - Execute demo scripts in cloud sandboxes with streaming output.
 *
 * Flow: Browser → this route → cloud sandbox → streamed output back
 *
 * Interactive sessions: The first request from a browser session creates a
 * long-lived sandbox (10 min idle timeout). Subsequent requests reuse it via
 * KV-stored sandboxId keyed by the `atid` cookie thread ID. If the interactive
 * path fails for any reason, falls back to one-shot `sandboxRun()`.
 *
 * Usage: GET /run?script=<name>&input=<base64JSON>
 */
import { createRouter, sse, createAgentContext } from '@agentuity/runtime';
import {
	APIClient,
	sandboxRun,
	sandboxCreate,
	sandboxExecute,
	executionGet,
	getServiceUrls,
	SandboxNotFoundError,
	SandboxTerminatedError,
} from '@agentuity/server';
import { getSignedCookie } from 'hono/cookie';
import { Writable } from 'node:stream';
import { SCRIPT_NAMES, SCRIPT_DEFAULTS } from './scripts';

const router = createRouter();

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;
const SANDBOX_EXEC_TIMEOUT = '2m';
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

const SESSION_BUCKET = 'explorer-sessions';
const SESSION_TTL = 600; // 10 min, matches sandbox idle timeout
const SANDBOX_IDLE_TIMEOUT = '10m';
const COOKIE_SECRET = process.env.AGENTUITY_SDK_KEY;

// ANSI escape sequence regex for stripping terminal colors
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

function cleanOutput(content: string): string {
	return content
		.replace(ANSI_ESCAPE_REGEX, '')
		.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z[ \t]*/gm, '')
		.replace(/\\"/g, '"')
		.replace(/\\n/g, '\n');
}

router.get(
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

		if (process.env.S3_BUCKET) envVars.S3_BUCKET = process.env.S3_BUCKET;
		if (process.env.S3_ENDPOINT) envVars.S3_ENDPOINT = process.env.S3_ENDPOINT;
		if (process.env.S3_ACCESS_KEY_ID) envVars.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
		if (process.env.S3_SECRET_ACCESS_KEY)
			envVars.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

		const scriptPath = `dist/run/${scriptName}.js`;
		const command = ['bun', 'run', scriptPath, JSON.stringify(input)];

		// --- Interactive session path ---
		try {
			const threadId = COOKIE_SECRET
				? await getSignedCookie(c, COOKIE_SECRET, 'atid')
				: undefined;

			if (threadId && typeof threadId === 'string') {
				const ctx = createAgentContext();
				const kvResult = await ctx.kv.get<string>(SESSION_BUCKET, threadId);

				let sandboxId: string;

				if (kvResult.exists) {
					sandboxId = kvResult.data;
					logger?.info('Reusing sandbox', { sandboxId, threadId, script: scriptName });

					try {
						const output = await executeOnSandbox(client, sandboxId, command, orgId);
						await ctx.kv.set(SESSION_BUCKET, threadId, sandboxId, { ttl: SESSION_TTL });
						await sendOutput(stream, output);
						return;
					} catch (err) {
						if (err instanceof SandboxNotFoundError || err instanceof SandboxTerminatedError) {
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

				const output = await executeOnSandbox(client, sandboxId, command, orgId);
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
		let sentRunningStatus = false;
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
					// Send 'running' status once on first output, then stdout
					if (!sentRunningStatus) {
						sentRunningStatus = true;
						stream
							.writeSSE({ event: 'status', data: 'running' })
							.then(() => stream.writeSSE({ event: 'stdout', data: encoded }))
							.then(() => callback(), callback);
					} else {
						stream.writeSSE({ event: 'stdout', data: encoded }).then(() => callback(), callback);
					}
				} else {
					callback();
				}
			},
		});

		try {
			logger?.info('Running sandbox script (one-shot)', { script: scriptName });

			const result = await sandboxRun(client, {
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
			});

			const exitCode = detectedExitCode ?? result.exitCode;
			logger?.info('Sandbox completed', { script: scriptName, sandboxId: result.sandboxId, exitCode });

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

	// Fetch output and wait for completion in parallel
	// The fetch blocks until data is available (when execution completes)
	const [result, stdout, stderr] = await Promise.all([
		executionGet(client, {
			executionId: execution.executionId,
			orgId,
			wait: '5m',
		}),
		fetchOutput(execution.stdoutStreamUrl),
		fetchOutput(execution.stderrStreamUrl),
	]);

	// Combine stdout and stderr (stderr often has logger output)
	const output = [stdout, stderr].filter(Boolean).join('\n');

	return { output, exitCode: result.exitCode ?? 0 };
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
	await stream.writeSSE({ event: 'status', data: 'running' });

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
