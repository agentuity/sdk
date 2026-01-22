/**
 * Sandbox Route - Execute demo scripts in cloud sandboxes with streaming output.
 *
 * Architecture:
 * ```
 * Frontend (useSandboxRunner.ts)
 *     |
 *     v  GET /api/sandbox/run?script=hello&input=base64JSON
 *     |
 * Backend (route.ts)
 *     |
 *     +-> sandboxRun() - One-shot execution (create → run → destroy)
 *     |
 *     v  SSE events: status, stdout, done, error
 *     |
 * Frontend
 *     +-> TerminalOutput displays logs + result
 * ```
 *
 * Usage: GET /run?script=<name>&input=<base64JSON>
 *   - script: Name of script in src/run/ (e.g., "hello", "vector", "kv")
 *   - input: Optional base64-encoded JSON input (defaults per script)
 *
 * Wrapper scripts (src/run/*.ts) are injected at runtime via command.files,
 * so changes don't require snapshot rebuilds. Only rebuild when deps change.
 *
 * Environment:
 *   - SANDBOX_SNAPSHOT_ID: Required. Snapshot with deps + agent code.
 *   - AGENTUITY_SDK_KEY or AGENTUITY_CLI_KEY: Required. API authentication.
 *   - AGENTUITY_REGION: Optional. Defaults to 'usc'.
 */
import { createRouter, sse } from '@agentuity/runtime';
import { APIClient, sandboxRun, getServiceUrls } from '@agentuity/server';
import { Writable } from 'node:stream';
import { readFile } from 'fs/promises';
import { join } from 'path';

const router = createRouter();

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;

// Execution timeout for commands (2 min for LLM demos)
const SANDBOX_EXEC_TIMEOUT = '2m';

// AI Gateway base URL
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

// Default inputs for each script (paths derived from script name)
const SCRIPT_DEFAULTS: Record<string, unknown> = {
	hello: { name: 'World' },
	vector: { query: 'ergonomic office chair', seedData: true },
	kv: {},
	'ai-gateway': { prompt: 'Explain AI agents in 1 sentence.' },
	streaming: { prompt: 'Write a short poem about AI.' },
	'sse-stream': { prompt: 'Explain what Server-Sent Events are in 2-3 sentences.' },
	chat: { message: 'What is Agentuity?' },
	'handler-context': {},
	objectstore: {},
	'durable-stream': { content: 'This is a durable stream demo.\nContent persists with a shareable URL.' },
	cron: {},
	'agent-calls': { name: 'Explorer' },
	'model-arena': { prompt: 'Explain AI agents in 1 sentence.' },
	evals: { question: 'What is Agentuity and what are its main features?' },
};

/**
 * Clean stream content by stripping ANSI codes, timestamps, and normalizing output.
 * This normalizes sandbox output for display in the terminal UI.
 *
 * @param content - Raw output from sandbox execution
 * @returns Cleaned output ready for display
 */
function cleanOutput(content: string): string {
	// Strip ANSI escape codes (color codes like [0m, [32m, etc.)
	let cleaned = content.replace(/\x1b\[[0-9;]*m/g, '');
	// Strip timestamps from log lines (e.g., "2026-01-12T01:58:00.123Z ")
	// Use [ \t]* instead of \s* to preserve newlines (empty lines)
	cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z[ \t]*/gm, '');
	// Unescape JSON quotes (\" -> ")
	cleaned = cleaned.replace(/\\"/g, '"');
	// Unescape newlines from JSON
	cleaned = cleaned.replace(/\\n/g, '\n');
	return cleaned;
}

router.get(
	'/run',
	sse(async (c, stream) => {
		if (!SNAPSHOT_ID) {
			await stream.writeSSE({ event: 'error', data: 'SANDBOX_SNAPSHOT_ID not configured.' });
			return;
		}
		const snapshotId = SNAPSHOT_ID;

		const scriptName = c.req.query('script');
		if (!scriptName || !(scriptName in SCRIPT_DEFAULTS)) {
			await stream.writeSSE({
				event: 'error',
				data: `Unknown script: ${scriptName}. Available: ${Object.keys(SCRIPT_DEFAULTS).join(', ')}`,
			});
			return;
		}

		// Parse input or use default
		const inputBase64 = c.req.query('input');
		let input: unknown;
		if (inputBase64) {
			try {
				input = JSON.parse(atob(inputBase64));
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

		// Get service URLs and create API client
		const serviceUrls = getServiceUrls(region);
		const client = new APIClient(serviceUrls.sandbox, logger, apiKey);

		// Track first output to send 'running' status
		let sentRunning = false;
		const sendRunningOnce = () => {
			if (!sentRunning) {
				sentRunning = true;
				stream.writeSSE({ event: 'status', data: 'running' });
			}
		};

		// Track output to detect actual exit code from error messages
		// sandboxRun returns hardcoded 0/1, but actual exit code is in output
		let detectedExitCode: number | null = null;

		// Create a Writable stream that forwards cleaned output to SSE
		// Note: SSE uses newlines as delimiters, so we encode \n as \\n
		// The frontend decodes this back to actual newlines
		const sseWritable = new Writable({
			write(chunk, _encoding, callback) {
				const raw = chunk.toString();
				const text = cleanOutput(raw);

				// Detect exit code from sandbox error output
				// Pattern: "[ERROR] [agentuity] process exited with error: exit status X"
				const exitMatch = raw.match(/process exited with error: exit status (\d+)/);
				if (exitMatch) {
					detectedExitCode = parseInt(exitMatch[1], 10);
				}

				// Skip empty chunks (but not chunks with just whitespace/newlines)
				if (text.length === 0) {
					callback();
					return;
				}
				// Send 'running' status on first output
				sendRunningOnce();
				// Encode newlines for SSE transport (decoded by frontend)
				const encoded = text.replace(/\n/g, '\\n');
				stream.writeSSE({ event: 'stdout', data: encoded }).then(() => callback(), callback);
			},
		});

		// Read the script to inject
		const scriptPath = `src/run/${scriptName}.ts`;
		let scriptContent: string;
		try {
			scriptContent = await readFile(join(process.cwd(), scriptPath), 'utf-8');
		} catch {
			await stream.writeSSE({ event: 'error', data: `Failed to read script: ${scriptPath}` });
			return;
		}

		// Build environment variables
		const envVars: Record<string, string> = {
			AGENTUITY_SDK_KEY: apiKey,
			AGENTUITY_REGION: region,
			OPENAI_API_KEY: apiKey,
			OPENAI_BASE_URL: `${AI_GATEWAY_URL}/openai`,
			ANTHROPIC_API_KEY: apiKey,
			ANTHROPIC_BASE_URL: `${AI_GATEWAY_URL}/anthropic`,
			GOOGLE_API_KEY: apiKey,
			GOOGLE_GENERATIVE_AI_BASE_URL: `${AI_GATEWAY_URL}/google`,
		};

		// Add S3 env vars if available (for objectstore demo)
		if (process.env.S3_BUCKET) envVars.S3_BUCKET = process.env.S3_BUCKET;
		if (process.env.S3_ENDPOINT) envVars.S3_ENDPOINT = process.env.S3_ENDPOINT;
		if (process.env.S3_ACCESS_KEY_ID) envVars.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
		if (process.env.S3_SECRET_ACCESS_KEY) envVars.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

		await stream.writeSSE({ event: 'status', data: 'creating' });

		try {
			// One-shot execution: create → run → destroy (automatic cleanup)
			const result = await sandboxRun(client, {
				options: {
					runtime: 'agentuity:latest',
					snapshot: snapshotId,
					network: { enabled: true },
					timeout: { idle: SANDBOX_EXEC_TIMEOUT },
					env: envVars,
					command: {
						exec: ['bun', 'run', scriptPath, JSON.stringify(input)],
						files: [{ path: scriptPath, content: Buffer.from(scriptContent) }],
					},
				},
				region,
				apiKey,
				stdout: sseWritable,
				stderr: sseWritable,
				logger,
			});

			// Use detected exit code from output if available, otherwise use sandboxRun result
			const exitCode = detectedExitCode ?? result.exitCode;

			logger?.info('Sandbox completed', {
				sandboxId: result.sandboxId,
				script: scriptName,
				exitCode,
				durationMs: result.durationMs,
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

export default router;
