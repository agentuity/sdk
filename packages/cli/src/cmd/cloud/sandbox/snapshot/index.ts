import { createCommand } from '../../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { tagSubcommand } from './tag';
import { getCommand } from '../../../../command-prefix';

export const snapshotCommand = createCommand({
	name: 'snapshot',
	aliases: ['snap'],
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
	],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand, tagSubcommand],
	requires: { auth: true, region: true, org: true },
});

export default snapshotCommand;
