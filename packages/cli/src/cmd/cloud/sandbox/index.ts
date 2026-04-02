import { createCommand } from '../../../types';
import { runSubcommand } from './run';
import { createSubcommand } from './create';
import { execSubcommand } from './exec';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { snapshotCommand } from './snapshot';
import { runtimeCommand } from './runtime';
import { command as fsCommand } from './fs';
import { command as executionCommand } from './execution';
import { command as jobCommand } from './job';
import { envSubcommand } from './env';
import { pauseSubcommand } from './pause';
import { resumeSubcommand } from './resume';
import { checkpointCommand } from './checkpoint';
import { statsSubcommand } from './stats';
import { eventsSubcommand } from './events';
import { getCommand } from '../../../command-prefix';

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
