import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { addSubcommand } from './add';
import { deleteSubcommand } from './delete';

export const resourceSubcommand = createCommand({
	name: 'resource',
	aliases: ['resources'],
	description: 'Manage cloud resources',
	tags: ['fast', 'requires-auth', 'requires-deployment'],
	subcommands: [listSubcommand, addSubcommand, deleteSubcommand],
});
