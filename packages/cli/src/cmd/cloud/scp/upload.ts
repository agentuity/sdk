import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getIONHost } from '../../../config';
import { getCommand } from '../../../command-prefix';
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
	requires: { apiClient: true, auth: true, region: true },
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
		const { apiClient, args, opts, project, projectDir, config, region } = ctx;

		let identifier = opts?.identifier ?? project?.projectId;

		if (!identifier) {
			identifier = await tui.showProjectList(apiClient, true);
		}

		const hostname = getIONHost(config, region);
		const destination = args.destination ?? '.';

		try {
			const spawn = Bun.spawn({
				cmd: ['scp', args.source, `${identifier}@${hostname}:${destination}`],
				cwd: projectDir,
				stdout: 'inherit',
				stderr: 'inherit',
				stdin: 'inherit',
			});

			await spawn.exited;

			if (spawn.exitCode !== 0) {
				tui.error(
					`SCP upload failed: ${args.source} -> ${identifier}@${hostname}:${destination} (exit code: ${spawn.exitCode})`
				);
				process.exit(spawn.exitCode ?? 1);
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
