import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getIONHost } from '../../config';
import { getCommand } from '../../command-prefix';

const args = z.object({
	identifier: z.string().optional().describe('The project or deployment id to use'),
	command: z.string().optional().describe('The command to run'),
});

const options = z.object({
	show: z.boolean().optional().describe('Show the command and exit'),
});

export const sshSubcommand = createSubcommand({
	name: 'ssh',
	description: 'SSH into a cloud project',
	tags: ['read-only', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: true,
	examples: [
		`${getCommand('cloud ssh')}                          # SSH into current project`,
		`${getCommand('cloud ssh')} proj_abc123xyz           # SSH into specific project`,
		`${getCommand('cloud ssh')} deploy_abc123xyz         # SSH into specific deployment`,
		`${getCommand('cloud ssh')} 'ps aux'                 # Run command and exit`,
		`${getCommand('cloud ssh')} proj_abc123xyz 'tail -f /var/log/app.log'`,
		`${getCommand('cloud ssh')} --show                   # Show SSH command without executing`,
	],
	toplevel: true,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: { args, options },

	async handler(ctx) {
		const { apiClient, project, projectDir, args, config, opts } = ctx;

		let projectId = project?.projectId;
		let identifier = args?.identifier;
		let command = args?.command;

		if (!(identifier?.startsWith('proj_') || identifier?.startsWith('deploy_'))) {
			command = identifier;
			identifier = undefined;
		}

		if (!projectId && !identifier) {
			projectId = await tui.showProjectList(apiClient, true);
		}

		const hostname = getIONHost(config);

		const cmd = ['ssh', `${identifier ?? projectId}@${hostname}`, command].filter(
			Boolean
		) as string[];

		// if show is passed, just show the SSH command and exit
		if (opts?.show) {
			if (command) {
				// if we have a command we want to show it quoted
				console.log(cmd[0], cmd[1], `'${cmd.slice(2).join(' ')}'`);
			} else {
				console.log(cmd.join(' '));
			}
			process.exit(0);
		}

		const spawn = Bun.spawn({
			cmd,
			cwd: projectDir,
			stdout: 'inherit',
			stderr: 'inherit',
			stdin: 'inherit',
		});

		await spawn.exited;

		process.exit(spawn.exitCode);
	},
});
