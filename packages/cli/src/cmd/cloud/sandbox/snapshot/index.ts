import { createCommand } from '../../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { tagSubcommand } from './tag';
import { buildSubcommand } from './build';
import { generateSubcommand } from './generate';
import { getCommand } from '../../../../command-prefix';

export const snapshotCommand = createCommand({
	name: 'snapshot',
	aliases: ['snap', 'snapshots'],
	description: 'Manage sandbox snapshots',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox snapshot create <sandbox-id>'),
			description: 'Create a snapshot from a sandbox',
		},
		{
			command: getCommand('cloud sandbox snapshot list'),
			description: 'List all snapshots',
		},
		{
			command: getCommand('cloud sandbox snapshot build .'),
			description: 'Build a snapshot from a declarative file',
		},
		{
			command: getCommand('cloud sandbox snapshot generate > agentuity-snapshot.yaml'),
			description: 'Generate a template build file',
		},
	],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		tagSubcommand,
		buildSubcommand,
		generateSubcommand,
	],
	requires: { auth: true, org: true },
});

export default snapshotCommand;
