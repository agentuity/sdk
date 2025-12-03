import { createCommand } from '../../types';
import { createCommand as createProfileCmd } from './create';
import { useCommand } from './use';
import { listCommand } from './list';
import { showCommand } from './show';
import { deleteCommand } from './delete';
import { currentCommand } from './current';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'profile',
	description: 'Manage configuration profiles',
	tags: ['read-only', 'fast'],
	hidden: true,
	examples: [
		{ command: getCommand('profile list'), description: 'List all profiles' },
		{
			command: getCommand('profile use production'),
			description: 'Switch to production profile',
		},
	],
	subcommands: [
		createProfileCmd,
		useCommand,
		listCommand,
		showCommand,
		deleteCommand,
		currentCommand,
	],
});
