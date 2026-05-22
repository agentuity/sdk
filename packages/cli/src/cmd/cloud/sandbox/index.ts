import { createCommand } from '../../../types.ts';
import { runSubcommand } from './run.ts';
import { createSubcommand } from './create.ts';
import { execSubcommand } from './exec.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { snapshotCommand } from './snapshot/index.ts';
import { runtimeCommand } from './runtime/index.ts';
import { command as fsCommand } from './fs/index.ts';
import { command as executionCommand } from './execution/index.ts';
import { command as jobCommand } from './job/index.ts';
import { envSubcommand } from './env.ts';
import { pauseSubcommand } from './pause.ts';
import { resumeSubcommand } from './resume.ts';
import { checkpointCommand } from './checkpoint/index.ts';
import { statsSubcommand } from './stats.ts';
import { eventsSubcommand } from './events.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'sandbox',
	aliases: ['sb'],
	description: 'Manage sandboxes for managed isolated code execution',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox run -- echo "hello"'),
			description: 'Run a one-shot command in a sandbox',
		},
		{
			command: getCommand('cloud sandbox create'),
			description: 'Create an interactive sandbox',
		},
		{
			command: getCommand('cloud sandbox list'),
			description: 'List all sandboxes',
		},
	],
	subcommands: [
		runSubcommand,
		createSubcommand,
		execSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		snapshotCommand,
		runtimeCommand,
		fsCommand,
		executionCommand,
		jobCommand,
		envSubcommand,
		pauseSubcommand,
		resumeSubcommand,
		checkpointCommand,
		statsSubcommand,
		eventsSubcommand,
	],
	requires: { auth: true, org: true },
});

export default command;
