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
	name: 'secret',
	description: 'Manage secrets for your project',
	tags: ['fast', 'requires-auth', 'requires-project'],
	examples: [
		{ command: getCommand('cloud secret list'), description: 'List all secrets' },
		{
			command: getCommand('cloud secret set API_KEY "sk_..."'),
			description: 'Set a secret value',
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
