import { createCommand } from '../../../types';
import listSubcommand from './list';
import getSubcommand from './get';
import deleteSubcommand from './delete';
import { getCommand } from '../../../command-prefix';

export const streamCommand = createCommand({
	name: 'stream',
	aliases: ['streams'],
	description: 'Manage streams',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud stream list'), description: 'List all streams' },
		{ command: getCommand('cloud stream get <id>'), description: 'Get stream details' },
	],
	subcommands: [listSubcommand, getSubcommand, deleteSubcommand],
});

export default streamCommand;
