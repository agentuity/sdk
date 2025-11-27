import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';

export const storageCommand = createCommand({
	name: 'storage',
	aliases: ['s3'],
	description: 'Manage storage resources',
	tags: ['fast', 'requires-auth', 'requires-deployment'],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand],
});
