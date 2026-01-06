import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getIONHost } from '../../config';
import { getCommand } from '../../command-prefix';
const args = z.object({
	identifier: z.string().optional().describe('The project, deployment, or sandbox id to use'),
	command: z.string().optional().describe('The command to run'),
});

const options = z.object({
	show: z.boolean().optional().describe('Show the command and exit'),
});

export const sshSubcommand = createSubcommand({
	name: 'ssh',
	description: 'SSH into a cloud project or sandbox',
	tags: ['read-only', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: true,
	examples: [
		{ command: getCommand('cloud ssh'), description: 'SSH into current project' },
		{ command: getCommand('cloud ssh proj_abc123xyz'), description: 'SSH into specific project' },
		{
			command: getCommand('cloud ssh deploy_abc123xyz'),
			description: 'SSH into specific deployment',
		},
		{
			command: getCommand('cloud ssh sbx_abc123xyz'),
			description: 'SSH into a sandbox',
		},
		{ command: getCommand("cloud ssh 'ps aux'"), description: 'Run command and exit' },
		{
			command: getCommand("cloud ssh proj_abc123xyz 'tail -f /var/log/app.log'"),
			description: 'Run command on specific project',
		},
		{
			command: getCommand('cloud ssh --show'),
			description: 'Show SSH command without executing',
		},
	],
	toplevel: true,
	requires: { auth: true, apiClient: true, region: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: { args, options },

	async handler(ctx) {
		const { apiClient, project, projectDir, args, config, opts, region } = ctx;

		let projectId = project?.projectId;
		let identifier = args?.identifier;
		let command = args?.command;

		if (
			!(
				identifier?.startsWith('proj_') ||
				identifier?.startsWith('deploy_') ||
				identifier?.startsWith('sbx_')
			)
		) {
			command = identifier;
			identifier = undefined;
		}

		if (!projectId && !identifier) {
			projectId = await tui.showProjectList(apiClient, true);
		}

		const hostname = getIONHost(config, region);

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
