import { createCommand } from '../../../types';
import { runSubcommand } from './run';
import { createSubcommand } from './create';
import { execSubcommand } from './exec';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { snapshotCommand } from './snapshot';
import { cpSubcommand } from './cp';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'sandbox',
	aliases: ['sb'],
	description: 'Manage sandboxes for isolated code execution',
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
		cpSubcommand,
	],
	requires: { auth: true, region: true, org: true },
});

export default command;
