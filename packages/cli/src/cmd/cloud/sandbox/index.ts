import { createCommand } from '../../../types.ts';
import { runSubcommand } from './run.ts';
import { createSubcommand } from './create.ts';
import { execSubcommand } from './exec.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { snapshotCommand } from './snapshot/index.ts';
import { runtimeCommand } from './runtime/index.ts';
import { cpSubcommand } from './cp.ts';
import { command as executionCommand } from './execution/index.ts';
import { mkdirSubcommand } from './mkdir.ts';
import { rmdirSubcommand } from './rmdir.ts';
import { rmSubcommand } from './rm.ts';
import { lsSubcommand } from './ls.ts';
import { downloadSubcommand } from './download.ts';
import { uploadSubcommand } from './upload.ts';
import { envSubcommand } from './env.ts';
import { pauseSubcommand } from './pause.ts';
import { resumeSubcommand } from './resume.ts';
import { checkpointCommand } from './checkpoint/index.ts';
import { statsSubcommand } from './stats.ts';
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
		cpSubcommand,
		executionCommand,
		mkdirSubcommand,
		rmdirSubcommand,
		rmSubcommand,
		lsSubcommand,
		downloadSubcommand,
		uploadSubcommand,
		envSubcommand,
		pauseSubcommand,
		resumeSubcommand,
		checkpointCommand,
		statsSubcommand,
	],
	requires: { auth: true, org: true },
});

export default command;
