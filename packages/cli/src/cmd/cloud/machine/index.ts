import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deploymentsSubcommand } from './deployments';
import { deleteSubcommand } from './delete';
import { getCommand } from '../../../command-prefix';

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
