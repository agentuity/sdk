import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
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
			network: z.boolean().optional().describe('Enable outbound network access'),
			timeout: z.string().optional().describe('Execution timeout (e.g., "5m", "1h")'),
			env: z.array(z.string()).optional().describe('Environment variables (KEY=VALUE)'),
			timestamps: z
				.boolean()
				.default(true)
				.optional()
				.describe('Include timestamps in output (default: true)'),
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

		const abortController = new AbortController();
		const handleSignal = () => {
			abortController.abort();
		};
		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		const outputChunks: string[] = [];

		try {
			const result = await sandboxRun(client, {
				options: {
					command: {
						exec: args.command,
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
				},
				orgId,
				signal: abortController.signal,
				onOutput: (chunk) => {
					if (options.json) {
						outputChunks.push(chunk);
					} else {
						process.stdout.write(chunk);
					}
				},
				logger,
			});

			const duration = Date.now() - started;
			const output = outputChunks.join('');

			if (!options.json) {
				if (result.exitCode === 0) {
					tui.success(`completed in ${duration}ms with exit code ${result.exitCode}`);
				} else {
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

export default runSubcommand;
