import { z } from 'zod';
import { Writable } from 'node:stream';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient, parseFileArgs } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxRun } from '@agentuity/server';

const SandboxRunResponseSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	exitCode: z.number().describe('Exit code from the process'),
	durationMs: z.number().describe('Duration in milliseconds'),
	output: z.string().optional().describe('Combined stdout/stderr output'),
});

export const runSubcommand = createCommand({
	name: 'run',
	description: 'Run a one-shot command in a sandbox (creates, executes, destroys)',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox run -- echo "hello world"'),
			description: 'Run a simple command',
		},
		{
			command: getCommand('cloud sandbox run --memory 1Gi --cpu 1000m -- bun run index.ts'),
			description: 'Run with resource limits',
		},
		{
			command: getCommand('cloud sandbox run --network -- curl https://api.example.com'),
			description: 'Run with network access enabled',
		},
	],
	schema: {
		args: z.object({
			command: z.array(z.string()).describe('Command and arguments to execute'),
		}),
		options: z.object({
			memory: z.string().optional().describe('Memory limit (e.g., "500Mi", "1Gi")'),
			cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
			disk: z.string().optional().describe('Disk limit (e.g., "500Mi", "1Gi")'),
			network: z.boolean().default(false).optional().describe('Enable outbound network access'),
			timeout: z.string().optional().describe('Execution timeout (e.g., "5m", "1h")'),
			env: z.array(z.string()).optional().describe('Environment variables (KEY=VALUE)'),
			file: z
				.array(z.string())
				.optional()
				.describe('Files to create in sandbox (sandbox-path:local-path)'),
			timestamps: z
				.boolean()
				.default(false)
				.optional()
				.describe('Include timestamps in output (default: true)'),
			snapshot: z.string().optional().describe('Snapshot ID or tag to restore from'),
			dependency: z
				.array(z.string())
				.optional()
				.describe('Apt packages to install (can be specified multiple times)'),
		}),
		response: SandboxRunResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		const envMap: Record<string, string> = {};
		if (opts.env) {
			for (const e of opts.env) {
				const [key, ...valueParts] = e.split('=');
				if (key) {
					envMap[key] = valueParts.join('=');
				}
			}
		}

		const files = parseFileArgs(opts.file);
		const hasFiles = files.length > 0;

		const abortController = new AbortController();
		const handleSignal = () => {
			abortController.abort();
		};
		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		const outputChunks: string[] = [];

		// Determine if we have stdin data (not a TTY means piped input)
		const hasStdin = !process.stdin.isTTY;

		// For JSON output, we need to capture output instead of streaming to process
		const stdout = options.json
			? createCaptureStream((chunk) => outputChunks.push(chunk))
			: process.stdout;
		const stderr = options.json
			? createCaptureStream((chunk) => outputChunks.push(chunk))
			: process.stderr;

		try {
			const result = await sandboxRun(client, {
				options: {
					command: {
						exec: args.command,
						files: hasFiles ? files : undefined,
					},
					resources:
						opts.memory || opts.cpu || opts.disk
							? {
									memory: opts.memory,
									cpu: opts.cpu,
									disk: opts.disk,
								}
							: undefined,
					network: opts.network ? { enabled: true } : undefined,
					timeout: opts.timeout ? { execution: opts.timeout } : undefined,
					env: Object.keys(envMap).length > 0 ? envMap : undefined,
					stream: opts.timestamps !== undefined ? { timestamps: opts.timestamps } : undefined,
					snapshot: opts.snapshot,
					dependencies: opts.dependency,
				},
				orgId,
				region,
				apiKey: auth.apiKey,
				signal: abortController.signal,
				stdin: hasStdin ? process.stdin : undefined,
				stdout,
				stderr,
				logger,
			});

			const duration = Date.now() - started;
			const output = outputChunks.join('');

			if (!options.json) {
				if (result.exitCode !== 0) {
					tui.error(`failed with exit code ${result.exitCode} in ${duration}ms`);
				}
			}

			return {
				sandboxId: result.sandboxId,
				exitCode: result.exitCode,
				durationMs: result.durationMs,
				output: options.json ? output : undefined,
			};
		} finally {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		}
	},
});

function createCaptureStream(onChunk: (chunk: string) => void): Writable {
	return new Writable({
		write(
			chunk: Buffer | string,
			_encoding: string,
			callback: (error?: Error | null) => void
		): void {
			const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
			onChunk(text);
			callback();
		},
	});
}

export default runSubcommand;
