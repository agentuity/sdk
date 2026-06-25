import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient, parseFileArgs, cacheSandboxTarget } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxCreate, sandboxGet } from '@agentuity/server';
import { StructuredError } from '@agentuity/core';
import { validateAptDependencies } from '../../../utils/apt-validator.ts';
import { ErrorCode } from '../../../errors.ts';

const InvalidMetadataError = StructuredError(
	'InvalidMetadataError',
	'Metadata must be a valid JSON object'
);

const CREATE_WAIT_POLL_MS = 1000;
const CREATE_WAIT_STATUSES = ['idle', 'running', 'failed', 'terminated', 'deleted'];
const CREATE_READY_STATUSES = new Set(['idle', 'running']);
const CREATE_TERMINAL_STATUSES = new Set(['failed', 'terminated', 'deleted']);

const SandboxCreateResponseSchema = z.object({
	sandboxId: z.string().describe('Unique sandbox identifier'),
	status: z.string().describe('Current sandbox status'),
	url: z
		.string()
		.optional()
		.describe('Public URL for the sandbox (only set when --port is specified)'),
	stdoutStreamUrl: z.string().optional().describe('URL to the stdout output stream'),
	stderrStreamUrl: z.string().optional().describe('URL to the stderr output stream'),
	auditStreamUrl: z.string().optional().describe('URL to the audit event stream'),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create an interactive sandbox for multiple executions',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('cloud sandbox create'),
			description: 'Create a sandbox with default settings',
		},
		{
			command: getCommand('cloud sandbox create --runtime python:3.14'),
			description: 'Create a sandbox with Python runtime',
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
		{
			command: getCommand('cloud sandbox create --project-id proj_123'),
			description: 'Create a sandbox associated with a specific project',
		},
		{
			command: getCommand('cloud sandbox create --disable-snapshots'),
			description: 'Create a sandbox without workspace disk snapshots for faster I/O',
		},
	],
	schema: {
		options: z.object({
			runtime: z.string().optional().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
			runtimeId: z.string().optional().describe('Runtime ID (e.g., "srt_xxx")'),
			name: z.string().optional().describe('Sandbox name'),
			description: z.string().optional().describe('Sandbox description'),
			memory: z.string().optional().describe('Memory limit (e.g., "500Mi", "1Gi")'),
			cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
			disk: z.string().optional().describe('Disk limit (e.g., "500Mi", "1Gi")'),
			network: z.boolean().optional().describe('Enable outbound network access'),
			idleTimeout: z
				.string()
				.optional()
				.describe('Idle timeout before sandbox is reaped (e.g., "10m", "1h")'),
			pausedTimeout: z
				.string()
				.optional()
				.describe('Maximum time sandbox can remain paused before termination (e.g., "24h")'),
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
			scope: z
				.array(z.string())
				.optional()
				.describe(
					'Permission scopes for service access (e.g., kv:read, aigateway, services:write)'
				),
			port: z
				.number()
				.int()
				.min(1024)
				.max(65535)
				.optional()
				.describe('Port to expose from the sandbox to the outside Internet (1024-65535)'),
			projectId: z.string().optional().describe('Project ID to associate this sandbox with'),
			wait: z.boolean().optional().describe('Wait until the sandbox is ready before returning'),
			waitMs: z
				.number()
				.int()
				.nonnegative()
				.max(60000)
				.optional()
				.describe('Maximum time in milliseconds to wait when --wait is used'),
			disableSnapshots: z
				.boolean()
				.optional()
				.describe(
					'Skip workspace disk snapshots (instant checkpoints and rollback) for faster I/O'
				),
		}),
		response: SandboxCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, auth, region, config, logger, orgId, project } = ctx;
		const projectId = opts.projectId || project?.projectId;
		const client = createSandboxClient(logger, auth, region);
		const started = Date.now();

		// Validate apt dependencies before creating sandbox
		if (opts.dependency && opts.dependency.length > 0) {
			const aptValidation = await tui.spinner({
				message: 'Validating apt dependencies...',
				type: 'simple',
				callback: async () => {
					return await validateAptDependencies(opts.dependency!, region, config, logger);
				},
			});

			if (aptValidation.invalid.length > 0) {
				if (options.json) {
					return {
						sandboxId: '',
						status: 'failed',
						errors: aptValidation.invalid.map((pkg) => ({
							type: 'invalid-apt-dependency',
							package: pkg.package,
							error: pkg.error,
							searchUrl: pkg.searchUrl,
							availableVersions: pkg.availableVersions,
						})),
					} as never;
				}

				tui.error('Invalid apt dependencies:');
				tui.newline();
				for (const pkg of aptValidation.invalid) {
					tui.bullet(`${tui.bold(pkg.package)}: ${pkg.error}`);
					if (pkg.availableVersions && pkg.availableVersions.length > 0) {
						tui.muted(`    Available versions: ${pkg.availableVersions.join(', ')}`);
					}
					tui.muted(`    Search: ${tui.link(pkg.searchUrl)}`);
				}
				tui.newline();
				tui.fatal(
					'Fix the apt dependencies and try again. Search for valid packages at: https://packages.debian.org/stable/',
					ErrorCode.CONFIG_INVALID
				);
			}
		}

		const envMap: Record<string, string> = {};
		if (opts.env) {
			for (const e of opts.env) {
				const [key, ...valueParts] = e.split('=');
				if (key) {
					envMap[key] = valueParts.join('=');
				}
			}
		}

		const files = await parseFileArgs(opts.file);
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

		let result = await sandboxCreate(client, {
			options: {
				projectId,
				runtime: opts.runtime,
				runtimeId: opts.runtimeId,
				name: opts.name,
				description: opts.description,
				resources:
					opts.memory || opts.cpu || opts.disk
						? {
								memory: opts.memory,
								cpu: opts.cpu,
								disk: opts.disk,
							}
						: undefined,
				network:
					opts.network || opts.port
						? { enabled: opts.network || opts.port !== undefined, port: opts.port }
						: undefined,
				timeout:
					opts.idleTimeout || opts.pausedTimeout
						? {
								idle: opts.idleTimeout,
								paused: opts.pausedTimeout,
							}
						: undefined,
				env: Object.keys(envMap).length > 0 ? envMap : undefined,
				files: hasFiles ? files : undefined,
				snapshot: opts.snapshot,
				dependencies: opts.dependency,
				metadata,
				scopes: opts.scope,
				disableSnapshots: opts.disableSnapshots,
			},
			orgId,
		});

		if (opts.wait) {
			const waitMs = opts.waitMs ?? 60000;
			const deadline = Date.now() + waitMs;

			while (
				!CREATE_READY_STATUSES.has(result.status) &&
				!CREATE_TERMINAL_STATUSES.has(result.status)
			) {
				const remainingMs = Math.max(0, deadline - Date.now());
				if (remainingMs === 0) {
					break;
				}
				const pollWaitMs = Math.min(remainingMs, CREATE_WAIT_POLL_MS);
				const current = await sandboxGet(client, {
					sandboxId: result.sandboxId,
					orgId,
					includeDeleted: true,
					waitForStatus: CREATE_WAIT_STATUSES,
					waitMs: pollWaitMs,
				});

				result = {
					...result,
					status: current.status === 'deleted' ? 'terminated' : current.status,
				};

				if (
					CREATE_READY_STATUSES.has(current.status) ||
					CREATE_TERMINAL_STATUSES.has(current.status)
				) {
					break;
				}
			}
		}

		if (
			CREATE_READY_STATUSES.has(result.status) &&
			!CREATE_TERMINAL_STATUSES.has(result.status)
		) {
			// Cache routing context for future sandbox commands.
			await cacheSandboxTarget(config?.name, result.sandboxId, region, orgId);
		}

		if (!options.json) {
			const duration = Date.now() - started;
			tui.success(`created sandbox ${tui.bold(result.sandboxId)} in ${duration}ms`);
			if (result.url) {
				tui.info(`url: ${tui.link(result.url)}`);
			}
		}

		return {
			sandboxId: result.sandboxId,
			status: result.status,
			url: result.url,
			stdoutStreamUrl: result.stdoutStreamUrl,
			stderrStreamUrl: result.stderrStreamUrl,
			auditStreamUrl: result.auditStreamUrl,
		};
	},
});
