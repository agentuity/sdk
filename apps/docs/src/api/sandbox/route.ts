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
 *     +-> getOrCreateSandbox() - Reuses or creates sandbox
 *     +-> client.writeFiles() - Injects script (SDK workaround)
 *     +-> sandbox.execute() - Runs script with stdout/stderr piping
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
 * Wrapper scripts (src/run/*.ts) are injected at runtime via writeFiles(),
 * so changes don't require snapshot rebuilds. Only rebuild when deps change.
 *
 * Environment:
 *   - SANDBOX_SNAPSHOT_ID: Required. Snapshot with deps + agent code.
 *   - AGENTUITY_SDK_KEY or AGENTUITY_CLI_KEY: Required. API authentication.
 *   - AGENTUITY_REGION: Optional. Defaults to 'usc'.
 */
import { createRouter, sse } from '@agentuity/runtime';
import type { Logger } from '@agentuity/runtime';
import { SandboxClient, type SandboxInstance } from '@agentuity/server';
import { Writable } from 'node:stream';
import { readFile } from 'fs/promises';
import { join } from 'path';

const router = createRouter();

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;

// Persistent sandbox instance for interactive mode
let sandboxInstance: SandboxInstance | null = null;

// Idle timeout for sandbox before automatic termination
const SANDBOX_IDLE_TIMEOUT = '10m';

// Execution timeout for individual commands (2 min for LLM streaming demos)
const SANDBOX_EXEC_TIMEOUT = '2m';

// AI Gateway base URL
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

/**
 * Get existing sandbox or create a new one.
 * Validates sandbox is still alive before returning.
 *
 * @param client - SandboxClient instance
 * @param snapshotId - Pre-validated snapshot ID (must not be null)
 * @param env - Environment variables to inject into sandbox
 * @param logger - Optional logger for debugging
 * @returns Active sandbox instance
 */
async function getOrCreateSandbox(
	client: SandboxClient,
	snapshotId: string,
	env: Record<string, string>,
	logger?: Logger
): Promise<SandboxInstance> {
	if (sandboxInstance) {
		try {
			const info = await sandboxInstance.get();
			if (info.status === 'idle' || info.status === 'running') {
				logger?.debug('Reusing existing sandbox', { sandboxId: sandboxInstance.id });
				return sandboxInstance;
			}
		} catch {
			// Sandbox no longer exists, will recreate
			sandboxInstance = null;
		}
	}

	logger?.info('Creating new sandbox');
	sandboxInstance = await client.create({
		runtime: 'agentuity:latest',
		snapshot: snapshotId,
		network: { enabled: true },
		timeout: { idle: SANDBOX_IDLE_TIMEOUT },
		env,
	});

	logger?.info('Sandbox created', { sandboxId: sandboxInstance.id });
	return sandboxInstance;
}

// Default inputs for each script (paths derived from script name)
const SCRIPT_DEFAULTS: Record<string, unknown> = {
	hello: { name: 'World' },
	vector: { query: 'ergonomic office chair', seedData: true },
	kv: {},
	'ai-gateway': { prompt: 'Explain AI agents in 1 sentence.' },
	streaming: { prompt: 'Write a short poem about coding.' },
	'sse-stream': { prompt: 'Explain what Server-Sent Events are in 2-3 sentences.' },
	chat: { message: 'What is Agentuity?' },
	'handler-context': {},
	objectstore: {},
	'durable-stream': { content: 'This is a durable stream demo.\nContent persists with a shareable URL.' },
	cron: {},
	'agent-calls': { text: '  Hello!!!  World...  #testing   @demo  ' },
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
	cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/gm, '');
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
		// Capture validated snapshotId for use in executeInSandbox
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
		const client = new SandboxClient({ apiKey, logger });

		// Create a Writable stream that forwards cleaned output to SSE
		// Note: SSE uses newlines as delimiters, so we encode \n as \\n
		// The frontend decodes this back to actual newlines
		const sseWritable = new Writable({
			write(chunk, _encoding, callback) {
				const text = cleanOutput(chunk.toString());
				// Encode newlines for SSE transport (decoded by frontend)
				const encoded = text.replace(/\n/g, '\\n');
				stream.writeSSE({ event: 'stdout', data: encoded }).then(() => callback(), callback);
			},
		});

		// All demos use standalone scripts from src/run/
		const scriptPath = `src/run/${scriptName}.ts`;
		let scriptContent: string;
		try {
			scriptContent = await readFile(join(process.cwd(), scriptPath), 'utf-8');
		} catch {
			await stream.writeSSE({ event: 'error', data: `Failed to read script: ${scriptPath}` });
			return;
		}
		const execCommand = ['bun', 'run', scriptPath, JSON.stringify(input)];
		const files = [{ path: scriptPath, content: Buffer.from(scriptContent) }];

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

		/**
		 * Execute command in sandbox with retry on sandbox errors.
		 * Creates a new sandbox if needed, or reuses an existing one.
		 *
		 * TODO: Consider migrating to SandboxClient.run() for simpler one-shot execution.
		 * The run() method handles create/execute/destroy lifecycle automatically.
		 * Current pattern with sandbox reuse is kept for faster subsequent runs.
		 * Evaluate switching when run() supports sandbox reuse or when testing is complete.
		 */
		const executeInSandbox = async (retry = false): Promise<{ exitCode: number; sandboxId: string }> => {
			await stream.writeSSE({ event: 'status', data: retry ? 'recreating' : 'creating' });

			const sandbox = await getOrCreateSandbox(client, snapshotId, envVars, logger);

			// Workaround: execute({files}) doesn't work, use writeFiles() instead
			// See: https://github.com/agentuity/sdk/issues/675
			if (files && files.length > 0) {
				await client.writeFiles(sandbox.id, files);
			}

			await stream.writeSSE({ event: 'status', data: 'running' });

			const result = await sandbox.execute({
				command: execCommand,
				timeout: SANDBOX_EXEC_TIMEOUT,
				pipe: {
					stdout: sseWritable,
					stderr: sseWritable,
				},
			});

			return { exitCode: result.exitCode ?? 0, sandboxId: sandbox.id };
		};

		try {
			let result: { exitCode: number; sandboxId: string };
			try {
				result = await executeInSandbox();
			} catch (error) {
				// If sandbox is gone/terminated, clear instance and retry once
				const msg = error instanceof Error ? error.message : '';
				if (msg.includes('not found') || msg.includes('terminated')) {
					logger?.warn('Sandbox gone, recreating', { error: msg });
					sandboxInstance = null;
					result = await executeInSandbox(true);
				} else {
					throw error;
				}
			}

			// execute() handles pipe completion automatically (SDK v0.1.23+)

			logger?.info('Sandbox completed', { sandboxId: result.sandboxId, script: scriptName, exitCode: result.exitCode });

			await stream.writeSSE({
				event: 'done',
				data: JSON.stringify({ exitCode: result.exitCode, status: 'completed' }),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger?.error('Sandbox error', { error: message });
			await stream.writeSSE({ event: 'error', data: message });
		}
	})
);

export default router;
