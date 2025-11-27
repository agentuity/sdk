import { createCommand } from '../../../types';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { searchSubcommand } from './search';

export const vectorCommand = createCommand({
	name: 'vector',
	aliases: ['vec'],
	description: 'Manage vector storage for your projects',
	tags: ['requires-auth', 'destructive', 'deletes-resource', 'slow'],
	subcommands: [searchSubcommand, getSubcommand, deleteSubcommand],
	requires: { auth: true, project: true },
});

export default vectorCommand;
