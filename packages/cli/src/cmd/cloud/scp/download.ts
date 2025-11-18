import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getIONHost } from '../../../config';

const args = z.object({
	source: z.string().describe('the source file'),
	destination: z.string().optional().describe('the destination file'),
});

const options = z.object({
	identifier: z.string().optional().describe('The project or deployment id to use'),
});

export const downloadCommand = createSubcommand({
	name: 'download',
	aliases: ['get'],
	description: 'Download a file using security copy',
	requires: { apiClient: true, auth: true },
	optional: { project: true },
	schema: { args, options },

	async handler(ctx) {
		const { apiClient, args, opts, project, projectDir, config } = ctx;

		let identifier = opts?.identifier ?? project?.projectId;

		if (!identifier) {
			identifier = await tui.showProjectList(apiClient, true);
		}

		const hostname = getIONHost(config);
		const destination = args.destination ?? projectDir;

		try {
			const spawn = Bun.spawn({
				cmd: ['scp', `${identifier}@${hostname}:${args.source}`, destination],
				cwd: projectDir,
				stdout: 'inherit',
				stderr: 'inherit',
				stdin: 'inherit',
			});

			await spawn.exited;

			if (spawn.exitCode !== 0) {
				tui.error(
					`SCP download failed: ${identifier}@${hostname}:${args.source} -> ${destination} (exit code: ${spawn.exitCode})`
				);
				process.exit(spawn.exitCode ?? 1);
			}
		} catch (error) {
			tui.error(
				`SCP download error: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
			process.exit(1);
		}
		},
});
