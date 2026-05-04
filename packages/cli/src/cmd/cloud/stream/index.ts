import { createCommand } from '../../../types.ts';
import createSubcommand from './create.ts';
import listSubcommand from './list.ts';
import getSubcommand from './get.ts';
import deleteSubcommand from './delete.ts';
import statsSubcommand from './stats.ts';
import { getCommand } from '../../../command-prefix.ts';

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
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		statsSubcommand,
	],
});

export default streamCommand;
