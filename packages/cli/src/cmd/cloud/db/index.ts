import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { sqlSubcommand } from './sql';

export const dbCommand = createCommand({
	name: 'db',
	aliases: ['database'],
	description: 'Manage database resources',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	subcommands: [createSubcommand, listSubcommand, getSubcommand, deleteSubcommand, sqlSubcommand],
});
