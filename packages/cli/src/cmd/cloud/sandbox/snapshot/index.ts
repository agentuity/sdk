import { createCommand } from '../../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { tagSubcommand } from './tag.ts';
import { buildSubcommand } from './build.ts';
import { generateSubcommand } from './generate.ts';
import { getCommand } from '../../../../command-prefix.ts';

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
