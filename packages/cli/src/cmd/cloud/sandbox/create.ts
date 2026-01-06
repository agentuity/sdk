import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient, parseFileArgs } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxCreate } from '@agentuity/server';
import { StructuredError } from '@agentuity/core';

const InvalidMetadataError = StructuredError(
	'InvalidMetadataError',
	'Metadata must be a valid JSON object'
);

const SandboxCreateResponseSchema = z.object({
	sandboxId: z.string().describe('Unique sandbox identifier'),
	status: z.string().describe('Current sandbox status'),
	stdoutStreamUrl: z.string().optional().describe('URL to the stdout output stream'),
	stderrStreamUrl: z.string().optional().describe('URL to the stderr output stream'),
});

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create an interactive sandbox for multiple executions',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox create'),
			description: 'Create a sandbox with default settings',
		},
		{
			command: getCommand('cloud sandbox create --memory 1Gi --cpu 1000m'),
			description: 'Create a sandbox with resource limits',
		},
		{
			command: getCommand('cloud sandbox create --network --idle-timeout 30m'),
			description: 'Create a sandbox with network and custom timeout',
		},
		{
			command: getCommand('cloud sandbox create --env KEY=VAL'),
			description: 'Create a sandbox with a specific environment variable',
		},
	],
	schema: {
		options: z.object({
			memory: z.string().optional().describe('Memory limit (e.g., "500Mi", "1Gi")'),
			cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
			disk: z.string().optional().describe('Disk limit (e.g., "500Mi", "1Gi")'),
			network: z.boolean().optional().describe('Enable outbound network access'),
			idleTimeout: z
				.string()
				.optional()
				.describe('Idle timeout before sandbox is reaped (e.g., "10m", "1h")'),
			env: z.array(z.string()).optional().describe('Environment variables (KEY=VALUE)'),
			file: z
				.array(z.string())
				.optional()
				.describe('Files to create in sandbox (sandbox-path:local-path)'),
			snapshot: z.string().optional().describe('Snapshot ID or tag to restore from'),
			dependency: z
				.array(z.string())
				.optional()
				.describe('Apt packages to install (can be specified multiple times)'),
			metadata: z.string().optional().describe('JSON object of user-defined metadata'),
		}),
		response: SandboxCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, auth, region, logger, orgId } = ctx;
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

		let metadata: Record<string, unknown> | undefined;
		if (opts.metadata) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(opts.metadata);
			} catch {
				throw new InvalidMetadataError();
			}
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				throw new InvalidMetadataError();
			}
			metadata = parsed as Record<string, unknown>;
		}

		const result = await sandboxCreate(client, {
			options: {
				resources:
					opts.memory || opts.cpu || opts.disk
						? {
								memory: opts.memory,
								cpu: opts.cpu,
								disk: opts.disk,
							}
						: undefined,
				network: opts.network ? { enabled: true } : undefined,
				timeout: opts.idleTimeout ? { idle: opts.idleTimeout } : undefined,
				env: Object.keys(envMap).length > 0 ? envMap : undefined,
				command: hasFiles ? { exec: [], files } : undefined,
				snapshot: opts.snapshot,
				dependencies: opts.dependency,
				metadata,
			},
			orgId,
		});

		if (!options.json) {
			const duration = Date.now() - started;
			tui.success(`created sandbox ${tui.bold(result.sandboxId)} in ${duration}ms`);
		}

		return {
			sandboxId: result.sandboxId,
			status: result.status,
			stdoutStreamUrl: result.stdoutStreamUrl,
			stderrStreamUrl: result.stderrStreamUrl,
		};
	},
});

export default createSubcommand;
