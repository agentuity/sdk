import { createCommand } from '../../../types';
import { pullSubcommand } from './pull';
import { pushSubcommand } from './push';
import { setSubcommand } from './set';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { importSubcommand } from './import';
import { listSubcommand } from './list';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'env',
	description: 'Manage environment variables for your project',
	tags: ['fast', 'requires-auth', 'requires-project'],
	examples: [
		{ command: getCommand('cloud env list'), description: 'List environment variables' },
		{
			command: getCommand('cloud env set NODE_ENV production'),
			description: 'Set environment variable',
		},
	],
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
export default command;
