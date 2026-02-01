import { createCommand } from '../../../types';
import createSubcommand from './create';
import listSubcommand from './list';
import getSubcommand from './get';
import deleteSubcommand from './delete';
import { getCommand } from '../../../command-prefix';

export const streamCommand = createCommand({
	name: 'stream',
	aliases: ['streams'],
	description: 'Manage durable streams',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud stream create memory-share ./notes.md'),
			description: 'Create stream from file',
		},
		{
			command: `cat data.json | ${getCommand('cloud stream create memory-share -')}`,
			description: 'Create stream from stdin',
		},
		{ command: getCommand('cloud stream list'), description: 'List all streams' },
		{ command: getCommand('cloud stream get <id>'), description: 'Get stream details' },
	],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand],
});

export default streamCommand;
