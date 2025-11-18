import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getIONHost } from '../../../config';

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
	requires: { apiClient: true, auth: true },
	schema: { args, options },
	optional: { project: true },

	async handler(ctx) {
		const { apiClient, args, opts, project, projectDir, config } = ctx;

		let identifier = opts?.identifier ?? project?.projectId;

		if (!identifier) {
			identifier = await tui.showProjectList(apiClient, true);
		}

		const hostname = getIONHost(config);
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
		} catch (error) {
			tui.error(
				`SCP upload error: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
			process.exit(1);
		}
		},
});
