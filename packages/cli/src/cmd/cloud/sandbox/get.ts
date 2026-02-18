import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { cacheSandboxRegion, createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxGet, sandboxResolve } from '@agentuity/server';

const SandboxResourcesSchema = z.object({
	memory: z.string().optional().describe('Memory limit (e.g., "512Mi", "1Gi")'),
	cpu: z.string().optional().describe('CPU limit (e.g., "500m", "1000m")'),
	disk: z.string().optional().describe('Disk limit (e.g., "1Gi", "10Gi")'),
});

const SandboxRuntimeInfoSchema = z.object({
	id: z.string().describe('Runtime ID'),
	name: z.string().describe('Runtime name'),
	iconUrl: z.string().optional().describe('URL for runtime icon'),
	brandColor: z.string().optional().describe('Brand color for the runtime'),
	tags: z.array(z.string()).optional().describe('Runtime tags'),
});

const SandboxSnapshotInfoSchema = z.object({
	id: z.string().describe('Snapshot ID'),
	name: z.string().optional().describe('Snapshot name'),
	tag: z.string().optional().describe('Snapshot tag'),
	fullName: z.string().optional().describe('Full name with org slug'),
	public: z.boolean().describe('Whether snapshot is public'),
});

const SandboxGetResponseSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	name: z.string().optional().describe('Sandbox name'),
	description: z.string().optional().describe('Sandbox description'),
	status: z.string().describe('Current status'),
	createdAt: z.string().describe('Creation timestamp'),
	region: z.string().optional().describe('Region where sandbox is running'),
	runtime: SandboxRuntimeInfoSchema.optional().describe('Runtime information'),
	snapshot: SandboxSnapshotInfoSchema.optional().describe('Snapshot information'),
	executions: z.number().describe('Number of executions'),
	stdoutStreamUrl: z.string().optional().describe('URL to stdout output stream'),
	stderrStreamUrl: z.string().optional().describe('URL to stderr output stream'),
	dependencies: z.array(z.string()).optional().describe('Apt packages installed'),
	packages: z.array(z.string()).optional().describe('npm/bun packages installed globally'),
	metadata: z.record(z.string(), z.unknown()).optional().describe('User-defined metadata'),
	resources: SandboxResourcesSchema.optional().describe('Resource limits'),
	url: z.string().optional().describe('Public URL for the sandbox (if network port configured)'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get information about a sandbox',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox get abc123'),
			description: 'Get sandbox information',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		response: SandboxGetResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, config, apiClient } = ctx;

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		// Create regional client and get full sandbox details
		const client = createSandboxClient(logger, auth, sandboxInfo.region);
		const result = await sandboxGet(client, {
			sandboxId: args.sandboxId,
			orgId: sandboxInfo.orgId,
		});

		// Cache the region for future lookups
		if (result.region) {
			await cacheSandboxRegion(config?.name, args.sandboxId, result.region);
		}

		if (!options.json) {
			const statusColor =
				result.status === 'running'
					? tui.colorSuccess
					: result.status === 'idle'
						? tui.colorWarning
						: result.status === 'failed'
							? tui.colorError
							: tui.colorMuted;

			let streamDisplay: string | undefined;
			if (
				result.stdoutStreamUrl &&
				result.stderrStreamUrl &&
				result.stdoutStreamUrl === result.stderrStreamUrl
			) {
				streamDisplay = tui.link(result.stdoutStreamUrl);
			}

			const resourceParts: string[] = [];
			if (result.resources) {
				if (result.resources.memory) resourceParts.push(`memory=${result.resources.memory}`);
				if (result.resources.cpu) resourceParts.push(`cpu=${result.resources.cpu}`);
				if (result.resources.disk) resourceParts.push(`disk=${result.resources.disk}`);
			}

			const tableData: Record<string, string | number> = {
				Sandbox: tui.bold(result.sandboxId),
			};

			if (result.name) tableData['Name'] = result.name;
			if (result.description) tableData['Description'] = result.description;
			tableData['Status'] = statusColor(result.status);
			tableData['Created'] = result.createdAt;
			if (result.runtime?.name) tableData['Runtime'] = result.runtime.name;
			if (result.region) tableData['Region'] = result.region;
			if (result.snapshot?.id) {
				const snapshotDisplay =
					result.snapshot.public && result.snapshot.fullName
						? result.snapshot.fullName
						: result.snapshot.tag || result.snapshot.id;
				tableData['Snapshot'] = snapshotDisplay;
			}
			tableData['Executions'] = result.executions;
			if (streamDisplay) {
				tableData['Stream'] = streamDisplay;
			} else {
				if (result.stdoutStreamUrl)
					tableData['Stream (stdout)'] = tui.link(result.stdoutStreamUrl);
				if (result.stderrStreamUrl)
					tableData['Stream (stderr)'] = tui.link(result.stderrStreamUrl);
			}
			if (result.dependencies && result.dependencies.length > 0) {
				tableData['Dependencies'] = result.dependencies.join(', ');
			}
			if (resourceParts.length > 0) {
				tableData['Resources'] = resourceParts.join(', ');
			}
			if (result.metadata && Object.keys(result.metadata).length > 0) {
				tableData['Metadata'] = JSON.stringify(result.metadata);
			}
			if (result.url) {
				tableData['URL'] = tui.link(result.url);
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			sandboxId: result.sandboxId,
			name: result.name,
			description: result.description,
			status: result.status,
			createdAt: result.createdAt,
			region: result.region,
			runtime: result.runtime,
			snapshot: result.snapshot,
			executions: result.executions,
			stdoutStreamUrl: result.stdoutStreamUrl,
			stderrStreamUrl: result.stderrStreamUrl,
			dependencies: result.dependencies,
			metadata: result.metadata,
			resources: result.resources,
			url: result.url,
		};
	},
});

export default getSubcommand;
