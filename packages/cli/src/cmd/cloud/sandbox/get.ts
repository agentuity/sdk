import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { cacheSandboxRegion } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxGet } from '@agentuity/server';
import { getGlobalCatalystAPIClient } from '../../../config';

const SandboxResourcesSchema = z.object({
	memory: z.string().optional().describe('Memory limit (e.g., "512Mi", "1Gi")'),
	cpu: z.string().optional().describe('CPU limit (e.g., "500m", "1000m")'),
	disk: z.string().optional().describe('Disk limit (e.g., "1Gi", "10Gi")'),
});

const SandboxGetResponseSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	name: z.string().optional().describe('Sandbox name'),
	description: z.string().optional().describe('Sandbox description'),
	status: z.string().describe('Current status'),
	createdAt: z.string().describe('Creation timestamp'),
	region: z.string().optional().describe('Region where sandbox is running'),
	runtimeId: z.string().optional().describe('Runtime ID'),
	runtimeName: z.string().optional().describe('Runtime name'),
	snapshotId: z.string().optional().describe('Snapshot ID sandbox was created from'),
	snapshotTag: z.string().optional().describe('Snapshot tag sandbox was created from'),
	executions: z.number().describe('Number of executions'),
	stdoutStreamUrl: z.string().optional().describe('URL to stdout output stream'),
	stderrStreamUrl: z.string().optional().describe('URL to stderr output stream'),
	dependencies: z.array(z.string()).optional().describe('Apt packages installed'),
	metadata: z.record(z.string(), z.unknown()).optional().describe('User-defined metadata'),
	resources: SandboxResourcesSchema.optional().describe('Resource limits'),
	url: z.string().optional().describe('Public URL for the sandbox (if network port configured)'),
});

export const getSubcommand = createCommand({
	name: 'get',
	aliases: ['info', 'show'],
	description: 'Get information about a sandbox',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true },
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
		const { args, options, auth, logger, orgId, config } = ctx;
		const client = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const result = await sandboxGet(client, { sandboxId: args.sandboxId, orgId });

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

			const snapshotDisplay =
				result.snapshotId || result.snapshotTag
					? result.snapshotTag
						? result.snapshotId
							? `${result.snapshotTag} ${tui.muted('(' + result.snapshotId + ')')}`
							: result.snapshotTag
						: result.snapshotId
					: undefined;

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
			if (result.runtimeName) tableData['Runtime'] = result.runtimeName;
			if (result.region) tableData['Region'] = result.region;
			if (snapshotDisplay) tableData['Snapshot'] = snapshotDisplay;
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
			runtimeId: result.runtimeId,
			runtimeName: result.runtimeName,
			snapshotId: result.snapshotId,
			snapshotTag: result.snapshotTag,
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
