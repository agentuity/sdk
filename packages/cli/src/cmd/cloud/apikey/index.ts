import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';

export const command = createCommand({
	name: 'apikey',
	description: 'Manage API keys',
	tags: ['fast', 'requires-auth'],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand],
});
export default command;
