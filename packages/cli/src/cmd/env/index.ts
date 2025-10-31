import { createCommand } from '../../types';
import { pullSubcommand } from './pull';
import { pushSubcommand } from './push';
import { setSubcommand } from './set';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { importSubcommand } from './import';
import { listSubcommand } from './list';

export const command = createCommand({
	name: 'env',
	description: 'Manage environment variables for your project',
	subcommands: [
		listSubcommand,
		pullSubcommand,
		pushSubcommand,
		setSubcommand,
		getSubcommand,
		deleteSubcommand,
		importSubcommand,
	],
});
