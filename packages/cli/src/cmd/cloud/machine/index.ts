import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deploymentsSubcommand } from './deployments.ts';
import { deleteSubcommand } from './delete.ts';
import { getCommand } from '../../../command-prefix.ts';

export const machineCommand = createCommand({
	name: 'machine',
	description: 'Manage organization managed machines',
	tags: ['read-only', 'fast', 'requires-auth'],
	aliases: ['machines'],
	examples: [
		{ command: getCommand('cloud machine list'), description: 'List all machines' },
		{ command: getCommand('cloud machine get <id>'), description: 'Get machine details' },
		{
			command: getCommand('cloud machine deployments <id>'),
			description: 'List deployments on a machine',
		},
	],
	subcommands: [listSubcommand, getSubcommand, deploymentsSubcommand, deleteSubcommand],
});
