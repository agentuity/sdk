import { createCommand } from '../../../types.ts';
import { pullSubcommand } from './pull.ts';
import { pushSubcommand } from './push.ts';
import { setSubcommand } from './set.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { importSubcommand } from './import.ts';
import { listSubcommand } from './list.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'env',
	description: 'Manage environment variables and secrets for your project or organization',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud env list'), description: 'List all variables and secrets' },
		{
			command: getCommand('cloud env set NODE_ENV production'),
			description: 'Set environment variable',
		},
		{
			command: getCommand('cloud env set API_KEY "sk_..." --secret'),
			description: 'Set a secret',
		},
		{
			command: getCommand('cloud env set OPENAI_API_KEY "sk_..." --secret --org'),
			description: 'Set an organization-wide secret',
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
