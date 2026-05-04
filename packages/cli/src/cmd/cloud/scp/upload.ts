import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { getIONHost } from '../../../config.ts';
import { spawnInherit } from '../../../node-compat/proc.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import { getIdentifierRegion } from '../region-lookup.ts';
const args = z.object({
	source: z.string().describe('the source file'),
	destination: z
		.string()
		.optional()
		.describe('the destination file (defaults to . for current directory on remote)'),
});

const options = z.object({
	identifier: z.string().optional().describe('The project or deployment id to use'),
});

export const uploadCommand = createSubcommand({
	name: 'upload',
	aliases: ['cp', 'put'],
	description: 'Upload a file using security copy',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud scp upload ./config.json'),
			description: 'Upload to remote home directory',
		},
		{
			command: getCommand('cloud scp upload ./config.json /app/config.json'),
			description: 'Upload to specific path',
		},
		{
			command: getCommand('cloud scp upload ./config.json --identifier=proj_abc123xyz'),
			description: 'Upload to specific project',
		},
		{
			command: getCommand('cloud scp upload ./logs/*.log ~/logs/'),
			description: 'Upload multiple files',
		},
	],
	requires: { apiClient: true, auth: true },
	schema: {
		args,
		options,
		response: z.object({
			success: z.boolean().describe('Whether upload succeeded'),
			source: z.string().describe('Local source path'),
			destination: z.string().describe('Remote destination path'),
			identifier: z.string().describe('Project or deployment identifier'),
		}),
	},
	optional: { project: true },
	prerequisites: ['cloud deploy'],

	async handler(ctx) {
		const { apiClient, args, opts, project, projectDir, config, logger, auth } = ctx;

		let identifier = opts?.identifier ?? project?.projectId;

		if (!identifier) {
			identifier = await tui.showProjectList(apiClient, true);
		}

		// Look up region from identifier (project/deployment/sandbox)
		const profileName = config?.name;

		// For sandbox identifiers, use saved org preference (no prompting)
		const orgId = identifier.startsWith('sbx_') ? config?.preferences?.orgId : undefined;

		const region = await getIdentifierRegion(
			logger,
			auth,
			apiClient,
			profileName,
			identifier,
			orgId,
			config
		);

		const hostname = getIONHost(config, region);
		const destination = args.destination ?? '.';

		try {
			const { exitCode } = await spawnInherit({
				cmd: ['scp', args.source, `${identifier}@${hostname}:${destination}`],
				cwd: projectDir,
			});

			if (exitCode !== 0) {
				tui.error(
					`SCP upload failed: ${args.source} -> ${identifier}@${hostname}:${destination} (exit code: ${exitCode})`
				);
				process.exit(exitCode ?? 1);
			}

			return {
				success: true,
				source: args.source,
				destination,
				identifier,
			};
		} catch (error) {
			tui.error(`SCP upload error: ${error instanceof Error ? error.message : 'Unknown error'}`);
			process.exit(1);
		}
	},
});
