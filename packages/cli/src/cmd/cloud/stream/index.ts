import { createCommand } from '../../../types';
import listSubcommand from './list';
import getSubcommand from './get';
import deleteSubcommand from './delete';

export const streamCommand = createCommand({
	name: 'stream',
	aliases: ['streams'],
	description: 'Manage streams',
	tags: ['slow', 'requires-auth'],
	subcommands: [listSubcommand, getSubcommand, deleteSubcommand],
});

export default streamCommand;
