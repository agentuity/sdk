/**
 * Sandbox Route - Execute demo scripts in cloud sandboxes with streaming output.
 *
 * Flow: Browser → this route → cloud sandbox → streamed output back
 *
 * Usage: GET /run?script=<name>&input=<base64JSON>
 */
import { createRouter, sse } from '@agentuity/runtime';
import { APIClient, sandboxRun, getServiceUrls } from '@agentuity/server';
import { Writable } from 'node:stream';
import { SCRIPT_NAMES, SCRIPT_DEFAULTS } from './scripts';

const router = createRouter();

const SNAPSHOT_ID = process.env.SANDBOX_SNAPSHOT_ID;
const SANDBOX_EXEC_TIMEOUT = '2m'; // Max execution time per request
const AI_GATEWAY_URL = 'https://catalyst.agentuity.cloud/gateway';

// ANSI escape sequence regex for stripping terminal colors
const ANSI_ESCAPE_REGEX = new RegExp('\\x1b\\[[0-9;]*m', 'g');

function cleanOutput(content: string): string {
	let cleaned = content.replace(ANSI_ESCAPE_REGEX, '');
	cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z[ \t]*/gm, '');
	cleaned = cleaned.replace(/\\"/g, '"');
	cleaned = cleaned.replace(/\\n/g, '\n');
	return cleaned;
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

		// SSE writable stream for output
		let sentRunning = false;
		let detectedExitCode: number | null = null;

		const sseWritable = new Writable({
			write(chunk, _encoding, callback) {
				const raw = chunk.toString();
				const text = cleanOutput(raw);

				const exitMatch = raw.match(/process exited with error: exit status (\d+)/);
				if (exitMatch) {
					detectedExitCode = parseInt(exitMatch[1], 10);
				}

				if (text.length === 0) {
					callback();
					return;
				}

				if (!sentRunning) {
					sentRunning = true;
					stream.writeSSE({ event: 'status', data: 'running' });
				}

				const encoded = text.replace(/\n/g, '\\n');
				stream.writeSSE({ event: 'stdout', data: encoded }).then(() => callback(), callback);
			},
		});

		const scriptPath = `src/run/${scriptName}.ts`;
		const command = ['bun', 'run', scriptPath, JSON.stringify(input)];

		await stream.writeSSE({ event: 'status', data: 'creating' });

		try {
			logger?.info('Running sandbox script', { script: scriptName, snapshot: SNAPSHOT_ID });

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

			logger?.info('Sandbox completed', {
				script: scriptName,
				sandboxId: result.sandboxId,
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
